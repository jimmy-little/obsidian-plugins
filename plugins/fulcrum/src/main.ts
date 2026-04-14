import {
	MarkdownRenderer,
	Notice,
	Platform,
	Plugin,
	TFile,
	normalizePath,
	type ObsidianProtocolData,
	type WorkspaceLeaf,
} from "obsidian";
import {
	appendFulcrumProjectLog,
	formatFulcrumProjectLogLine,
	parseProjectLogLines,
	readFulcrumLogTail,
	type ProjectLogActivityEntry,
} from "./fulcrum/projectNote";
import {
	buildFullSnapshotBlock,
	buildSnapshotMarkdown,
	insertOrReplaceProjectSnapshot,
} from "./fulcrum/projectArchive";
import {
	FULCRUM_HOVER_SOURCE,
	VIEW_DASHBOARD,
	VIEW_PROJECT,
	VIEW_PROJECT_MANAGER,
	VIEW_TIMELINE,
} from "./fulcrum/constants";
import {
	ChangeProjectStatusModal,
	LinkMeetingModal,
	MarkProjectCompleteModal,
	MarkReviewedModal,
	QuickProjectNoteModal,
	NewInlineTaskModal,
	NewProjectModal,
	ProjectPickerModal,
} from "./fulcrum/modals";
import type {FulcrumHost} from "./fulcrum/pluginBridge";
import {
	openProjectSummaryLeaf,
	revealOrCreateAreas,
	revealOrCreateDashboard,
	revealOrCreateProjectManager,
	revealOrCreateTimeTracked,
	revealOrCreateTimeline,
	revealOrCreateReview,
} from "./fulcrum/openViews";
import {openNotePropertiesModal, revealOrCreateView} from "@obsidian-suite/core";
import {DEFAULT_SETTINGS, DASHBOARD_ACTIVITY_MAX_DAYS, type FulcrumSettings} from "./fulcrum/settingsDefaults";
import {postTaskNotesToggleStatus} from "./fulcrum/taskNotesApi";
import {toggleInlineTaskLine, toggleTaskNoteFrontmatter} from "./fulcrum/taskVaultToggle";
import {bumpSettingsRevision} from "./fulcrum/stores";
import type {IndexedTask} from "./fulcrum/types";
import {registerCompanionDocChrome} from "./fulcrum/companionDocChrome";
import {runLapseTimerInOpenNote} from "./fulcrum/lapseIntegration";
import {
	registerInlinePeoplePills,
	registerLivePreviewPeoplePillScan,
} from "./fulcrum/inlinePeoplePills";
import {openMarkdownBesideFulcrum, type FulcrumCompanionLeaf} from "./fulcrum/openBesideFulcrum";
import {createNewNoteFromTemplateForProject as runCreateNewNoteFromTemplate} from "./fulcrum/projectNewNoteFromTemplate";
import {VaultIndex} from "./fulcrum/VaultIndex";
import {FulcrumSettingTab} from "./settings";
import {DashboardView} from "./views/DashboardView";
import {ProjectManagerView} from "./views/ProjectManagerView";
import {ProjectView} from "./views/ProjectView";
import {TimelineView} from "./views/TimelineView";

export default class FulcrumPlugin extends Plugin implements FulcrumHost {
	settings: FulcrumSettings = DEFAULT_SETTINGS;
	vaultIndex!: VaultIndex;
	/** Reused markdown leaf for “open beside” from project / linked surfaces. */
	private readonly fulcrumCompanionLeaf: FulcrumCompanionLeaf = {current: null};

	async onload(): Promise<void> {
		await this.loadSettings();
		this.vaultIndex = new VaultIndex(this.app, () => this.settings);

		this.registerView(VIEW_PROJECT_MANAGER, (leaf) => new ProjectManagerView(leaf, this));
		this.registerView(VIEW_DASHBOARD, (leaf) => new DashboardView(leaf, this));
		this.registerView(VIEW_PROJECT, (leaf) => new ProjectView(leaf, this));
		this.registerView(VIEW_TIMELINE, (leaf) => new TimelineView(leaf, this));

		this.registerHoverLinkSource(FULCRUM_HOVER_SOURCE, {
			display: this.manifest.name,
			defaultMod: false,
		});

		this.registerEvent(
			this.app.metadataCache.on("resolve", () => {
				this.vaultIndex.scheduleRebuild();
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				this.vaultIndex.scheduleRebuild();
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.vaultIndex.scheduleRebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", () => {
				this.vaultIndex.scheduleRebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.vaultIndex.scheduleRebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", () => {
				this.vaultIndex.scheduleRebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (f) => {
				if (f instanceof TFile && f.extension === "md") {
					this.vaultIndex.scheduleRebuild();
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.vaultIndex.rebuild();
		});

		void this.vaultIndex.rebuild();
		const deferredRebuild = window.setTimeout(() => {
			void this.vaultIndex.rebuild();
		}, 750);
		this.register(() => window.clearTimeout(deferredRebuild));
		this.register(() => {
			this.fulcrumCompanionLeaf.current = null;
		});

		registerCompanionDocChrome(
			{
				app: this.app,
				getSettings: () => this.settings,
				registerEvent: (r) => this.registerEvent(r),
				startLapseInOpenNote: (file, meta) => runLapseTimerInOpenNote(this.app, file, meta),
				openNoteProperties: (file) => {
					openNotePropertiesModal(this.app, file, {
						displayTitleField: this.settings.atomicNoteEntryField,
					});
				},
				openProjectSummary: (path) => this.openProjectSummary(path),
			},
			this.fulcrumCompanionLeaf,
		);

		registerInlinePeoplePills(this, () => this.settings);
		registerLivePreviewPeoplePillScan(this, () => this.settings);

		this.addSettingTab(new FulcrumSettingTab(this.app, this));

		if (this.settings.showRibbonIcon) {
			this.addRibbonIcon("layout-dashboard", "Fulcrum Project Manager", () => {
				void this.openDashboard();
			});
		}

		this.addCommand({
			id: "open-dashboard",
			name: "Open Project Manager",
			callback: () => {
				void this.openDashboard();
			},
		});
		this.addCommand({
			id: "open-time-tracked",
			name: "Open time tracked",
			callback: () => {
				void this.openTimeTracked();
			},
		});
		this.addCommand({
			id: "open-areas",
			name: "Open areas",
			callback: () => {
				void this.openAreas();
			},
		});
		this.addCommand({
			id: "open-review",
			name: "Open review",
			callback: () => {
				void this.openReview();
			},
		});
		this.addCommand({
			id: "open-timeline",
			name: "Open timeline",
			callback: () => {
				void this.openTimeline();
			},
		});
		this.addCommand({
			id: "open-project-summary",
			name: "Open project summary",
			callback: () => {
				const projects = this.vaultIndex.getSnapshot().projects;
				if (projects.length === 0) {
					new Notice("No projects in the index yet.");
					return;
				}
				new ProjectPickerModal(this.app, projects, (p) => {
					void this.openProjectSummary(p.file.path);
				}).open();
			},
		});
		this.addCommand({
			id: "new-project",
			name: "New project",
			callback: () => {
				new NewProjectModal(this.app, this).open();
			},
		});
		this.addCommand({
			id: "link-meeting-to-project",
			name: "Link meeting to project",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("Open a meeting note first.");
					return;
				}
				const projects = this.vaultIndex.getSnapshot().projects;
				if (projects.length === 0) {
					new Notice("No projects in the index yet.");
					return;
				}
				new LinkMeetingModal(this.app, this, file).open();
			},
		});
		this.addCommand({
			id: "reindex",
			name: "Reindex vault",
			callback: () => {
				void this.refreshIndex();
			},
		});

		this.registerObsidianProtocolHandler(this.manifest.id, (params) => {
			this.handleFulcrumOpenUri(params);
		});
	}

	onunload(): void {
		this.vaultIndex.cancelScheduledRebuild();
	}

	private handleFulcrumOpenUri(params: ObsidianProtocolData): void {
		void this.applyFulcrumDeepLink(params).catch((err) => {
			console.error(err);
			new Notice("Fulcrum could not open that link.");
		});
	}

	private async applyFulcrumDeepLink(params: ObsidianProtocolData): Promise<void> {
		const screenRaw = String(params.screen ?? params.leaf ?? "").trim().toLowerCase();
		const route = String(params.route ?? "")
			.trim()
			.replace(/^\/+/, "");
		let screen = screenRaw;
		if (!screen && route) {
			const tail = route.replace(/^fulcrum\//i, "");
			const seg = tail.split("/")[0] ?? "";
			screen = seg.toLowerCase();
		}
		if (!screen) screen = "dashboard";

		const projectPath = String(params.projectPath ?? "").trim();
		const focalDate = String(params.focalDate ?? params.date ?? "").trim();

		switch (screen) {
			case "dashboard":
				await revealOrCreateDashboard(this.app, this.settings);
				return;
			case "areas":
				await revealOrCreateAreas(this.app, this.settings);
				return;
			case "kanban":
				await revealOrCreateProjectManager(this.app, this.settings, {mode: "kanban"});
				return;
			case "calendar":
				await revealOrCreateProjectManager(this.app, this.settings, {mode: "calendar"});
				return;
			case "time":
			case "time-tracked":
				await revealOrCreateTimeTracked(this.app, this.settings);
				return;
			case "timeline":
				await revealOrCreateTimeline(
					this.app,
					this.settings,
					focalDate.length >= 10 ? {focalDateIso: focalDate.slice(0, 10)} : undefined,
				);
				return;
			case "project":
				if (!projectPath) {
					new Notice('Fulcrum: add query param projectPath (vault path to the project note).');
					return;
				}
				await openProjectSummaryLeaf(this.app, this.settings, normalizePath(projectPath));
				return;
			case "classic":
				await revealOrCreateView(this.app, VIEW_DASHBOARD, this.settings.openViewsIn);
				return;
			default:
				new Notice(`Fulcrum: unknown screen "${screen}".`);
		}
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as Record<string, unknown> | null;
		const loaded = raw ?? {};
		const merged = {...DEFAULT_SETTINGS, ...loaded} as FulcrumSettings & Record<string, unknown>;

		const pathsRaw =
			typeof merged.taskNotesFolderPaths === "string" ? merged.taskNotesFolderPaths.trim() : "";
		const legacyFolder =
			typeof loaded.taskNotesFolder === "string" ? loaded.taskNotesFolder.trim() : "";
		if (!pathsRaw && legacyFolder) {
			merged.taskNotesFolderPaths = legacyFolder;
		}

		const mode = merged.taskSourceMode;
		if (mode !== "taskNotes" && mode !== "obsidianTasks" && mode !== "both") {
			const l = loaded.taskNotesEnabled !== false;
			const a = loaded.inlineTasksEnabled !== false;
			merged.taskSourceMode = l && a ? "both" : l ? "taskNotes" : a ? "obsidianTasks" : "both";
		}

		delete (merged as Record<string, unknown>).taskNotesFolder;
		delete (merged as Record<string, unknown>).taskNotesEnabled;
		delete (merged as Record<string, unknown>).inlineTasksEnabled;

		if (
			merged.projectStatusIndication !== "subfolder" &&
			merged.projectStatusIndication !== "frontmatter"
		) {
			merged.projectStatusIndication = DEFAULT_SETTINGS.projectStatusIndication;
		}
		if (
			merged.dashboardActiveProjectsGroupBy !== "area" &&
			merged.dashboardActiveProjectsGroupBy !== "status" &&
			merged.dashboardActiveProjectsGroupBy !== "reviewDue" &&
			merged.dashboardActiveProjectsGroupBy !== "none"
		) {
			merged.dashboardActiveProjectsGroupBy = DEFAULT_SETTINGS.dashboardActiveProjectsGroupBy;
		}
		if (
			merged.projectSidebarSortBy !== "launch" &&
			merged.projectSidebarSortBy !== "nextReview" &&
			merged.projectSidebarSortBy !== "rank" &&
			merged.projectSidebarSortBy !== "name"
		) {
			merged.projectSidebarSortBy = DEFAULT_SETTINGS.projectSidebarSortBy;
		}
		if (merged.projectSidebarSortDir !== "asc" && merged.projectSidebarSortDir !== "desc") {
			merged.projectSidebarSortDir = DEFAULT_SETTINGS.projectSidebarSortDir;
		}
		if (typeof merged.projectRankField !== "string") {
			merged.projectRankField = DEFAULT_SETTINGS.projectRankField;
		}
		if (
			merged.kanbanColumnBy !== "status" &&
			merged.kanbanColumnBy !== "area"
		) {
			merged.kanbanColumnBy = DEFAULT_SETTINGS.kanbanColumnBy;
		}
		if (!Array.isArray(merged.kanbanHiddenStatus)) {
			merged.kanbanHiddenStatus = DEFAULT_SETTINGS.kanbanHiddenStatus;
		}
		if (!Array.isArray(merged.kanbanHiddenArea)) {
			merged.kanbanHiddenArea = DEFAULT_SETTINGS.kanbanHiddenArea;
		}
		if (!Array.isArray(merged.kanbanOrderStatus)) {
			merged.kanbanOrderStatus = DEFAULT_SETTINGS.kanbanOrderStatus;
		}
		if (!Array.isArray(merged.kanbanOrderArea)) {
			merged.kanbanOrderArea = DEFAULT_SETTINGS.kanbanOrderArea;
		}
		if (!Array.isArray(merged.projectSidebarFilterUncheckedStatus)) {
			merged.projectSidebarFilterUncheckedStatus =
				DEFAULT_SETTINGS.projectSidebarFilterUncheckedStatus;
		}
		if (!Array.isArray(merged.projectSidebarFilterUncheckedArea)) {
			merged.projectSidebarFilterUncheckedArea =
				DEFAULT_SETTINGS.projectSidebarFilterUncheckedArea;
		}
		if (
			merged.calendarViewMode !== "month" &&
			merged.calendarViewMode !== "workWeek" &&
			merged.calendarViewMode !== "week" &&
			merged.calendarViewMode !== "threeDay" &&
			merged.calendarViewMode !== "day"
		) {
			merged.calendarViewMode = DEFAULT_SETTINGS.calendarViewMode;
		}
		if (
			merged.timeTrackerHorizon !== "7d" &&
			merged.timeTrackerHorizon !== "30d" &&
			merged.timeTrackerHorizon !== "90d" &&
			merged.timeTrackerHorizon !== "all"
		) {
			merged.timeTrackerHorizon = DEFAULT_SETTINGS.timeTrackerHorizon;
		}
		if (!Array.isArray(merged.timeTrackerExcludedAreaPaths)) {
			merged.timeTrackerExcludedAreaPaths = DEFAULT_SETTINGS.timeTrackerExcludedAreaPaths;
		}

		if (typeof merged.projectNewNoteTemplatePath !== "string") {
			merged.projectNewNoteTemplatePath = DEFAULT_SETTINGS.projectNewNoteTemplatePath;
		}
		if (
			merged.projectNewNoteDestinationMode !== "projectFolder" &&
			merged.projectNewNoteDestinationMode !== "customPath"
		) {
			merged.projectNewNoteDestinationMode = DEFAULT_SETTINGS.projectNewNoteDestinationMode;
		}
		if (typeof merged.projectNewNoteDestinationCustomPath !== "string") {
			merged.projectNewNoteDestinationCustomPath =
				DEFAULT_SETTINGS.projectNewNoteDestinationCustomPath;
		}
		if (typeof merged.projectNewNoteFileNamePattern !== "string") {
			merged.projectNewNoteFileNamePattern = DEFAULT_SETTINGS.projectNewNoteFileNamePattern;
		}

		{
			const n = merged.globalActivityDisplayDays;
			const clamped =
				typeof n === "number" && Number.isFinite(n)
					? Math.min(DASHBOARD_ACTIVITY_MAX_DAYS, Math.max(1, Math.round(n)))
					: DEFAULT_SETTINGS.globalActivityDisplayDays;
			merged.globalActivityDisplayDays = clamped;
		}

		this.settings = merged as FulcrumSettings;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async patchSettings(partial: Partial<FulcrumSettings>): Promise<void> {
		Object.assign(this.settings, partial);
		await this.saveData(this.settings);
		bumpSettingsRevision();
	}

	openLinkedNoteFromFulcrum(path: string, anchorLeaf?: WorkspaceLeaf): void {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) return;
		void openMarkdownBesideFulcrum(this.app, anchorLeaf, f, this.fulcrumCompanionLeaf);
	}

	openIndexedTask(task: IndexedTask, anchorLeaf?: WorkspaceLeaf): void {
		const f = this.app.vault.getAbstractFileByPath(task.file.path);
		if (!(f instanceof TFile)) return;
		const lineState =
			task.source === "inline" && task.line != null
				? {state: {line: task.line} as Record<string, unknown>, eState: {line: task.line} as Record<string, unknown>}
				: undefined;
		void openMarkdownBesideFulcrum(
			this.app,
			anchorLeaf,
			f,
			this.fulcrumCompanionLeaf,
			lineState,
		);
	}

	async toggleIndexedTask(task: IndexedTask): Promise<void> {
		if (!Platform.isDesktop) return;
		try {
			let apiOk = false;
			if (task.source === "taskNote" && this.settings.taskNotesHttpApiEnabled) {
				const ac = new AbortController();
				const to = window.setTimeout(() => ac.abort(), 12_000);
				try {
					const r = await postTaskNotesToggleStatus(
						this.settings.taskNotesHttpApiBaseUrl,
						this.settings.taskNotesHttpApiToken || undefined,
						task.file.path,
						ac.signal,
					);
					apiOk = r.ok;
					if (!apiOk) console.warn("Fulcrum TaskNotes API:", r.error);
				} finally {
					window.clearTimeout(to);
				}
			}
			if (!apiOk) {
				if (task.source === "taskNote") {
					await toggleTaskNoteFrontmatter(this.app, task, this.settings);
				} else {
					await toggleInlineTaskLine(this.app, task);
				}
			}
			await this.vaultIndex.rebuild();
		} catch (e) {
			console.error(e);
			new Notice("Could not update task.");
		}
	}

	triggerFulcrumHoverLink(
		event: MouseEvent,
		hoverParent: WorkspaceLeaf,
		targetEl: HTMLElement,
		path: string,
	): void {
		this.app.workspace.trigger("hover-link", {
			event,
			source: FULCRUM_HOVER_SOURCE,
			hoverParent,
			targetEl,
			linktext: path,
			sourcePath: path,
		});
	}

	async renderActivityBodyPreview(
		el: HTMLElement,
		sourcePath: string,
		markdown: string,
	): Promise<void> {
		el.empty();
		await MarkdownRenderer.render(this.app, markdown, el, sourcePath, this);
	}

	async openDashboard(): Promise<void> {
		await revealOrCreateDashboard(this.app, this.settings);
	}

	async openReview(): Promise<void> {
		await revealOrCreateReview(this.app, this.settings);
	}

	async openTimeTracked(): Promise<void> {
		await revealOrCreateTimeTracked(this.app, this.settings);
	}

	async openAreas(): Promise<void> {
		await revealOrCreateAreas(this.app, this.settings);
	}

	async openTimeline(): Promise<void> {
		await revealOrCreateTimeline(this.app, this.settings);
	}

	async openProjectSummary(path: string): Promise<void> {
		await openProjectSummaryLeaf(this.app, this.settings, path);
	}

	async refreshIndex(): Promise<void> {
		await this.vaultIndex.rebuild();
		new Notice("Fulcrum index rebuilt.");
	}

	async appendProjectLogEntry(projectPath: string, text: string): Promise<boolean> {
		const trimmed = text.trim();
		if (!trimmed) {
			new Notice("Write something to add to the project note.");
			return false;
		}
		const f = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(f instanceof TFile)) {
			new Notice("Project file not found.");
			return false;
		}
		const stamp = new Date().toLocaleString(undefined, {
			dateStyle: "short",
			timeStyle: "short",
		});
		const line = `- ${stamp} — ${trimmed.replace(/\s+/g, " ")}`;
		try {
			await appendFulcrumProjectLog(
				this.app,
				f,
				this.settings.projectLogSectionHeading,
				line,
			);
			await this.vaultIndex.rebuild();
			new Notice("Appended to project note.");
			return true;
		} catch (e) {
			console.error(e);
			new Notice("Could not write to the project note.");
			return false;
		}
	}

	openMarkReviewedModal(
		projectPath: string,
		onComplete?: () => void | Promise<void>,
	): void {
		new MarkReviewedModal(this.app, this, projectPath, onComplete).open();
	}

	openQuickProjectNoteModal(projectPath: string): void {
		new QuickProjectNoteModal(this.app, this, projectPath).open();
	}

	openProjectNoteProperties(projectPath: string): void {
		const f = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(f instanceof TFile)) {
			new Notice("Project file not found.");
			return;
		}
		openNotePropertiesModal(this.app, f, {displayTitleField: "name"});
	}

	openMarkProjectCompleteModal(
		projectPath: string,
		onComplete?: () => void | Promise<void>,
	): void {
		new MarkProjectCompleteModal(this.app, this, projectPath, onComplete).open();
	}

	openChangeProjectStatusModal(
		projectPath: string,
		currentStatus: string,
		onComplete?: (newPath?: string) => void | Promise<void>,
	): void {
		new ChangeProjectStatusModal(
			this.app,
			this,
			projectPath,
			currentStatus,
			onComplete,
		).open();
	}

	async loadProjectLogPreview(projectPath: string): Promise<string[]> {
		const f = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(f instanceof TFile)) return [];
		return readFulcrumLogTail(
			this.app,
			f,
			this.settings.projectLogSectionHeading,
			this.settings.projectLogPreviewMaxLines,
		);
	}

	async loadProjectLogActivity(projectPath: string): Promise<ProjectLogActivityEntry[]> {
		const f = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(f instanceof TFile)) return [];
		const raw = await readFulcrumLogTail(
			this.app,
			f,
			this.settings.projectLogSectionHeading,
			this.settings.projectLogPreviewMaxLines,
		);
		return parseProjectLogLines(raw);
	}

	async archiveProjectSnapshot(projectPath: string): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(f instanceof TFile)) {
			new Notice("Project file not found.");
			return;
		}
		const proj = this.vaultIndex.resolveProjectByPath(projectPath);
		if (!proj) {
			new Notice("Project not found in index.");
			return;
		}
		try {
			const rollup = await this.vaultIndex.getProjectRollup(projectPath, this.settings);
			if (!rollup) {
				new Notice("Could not load project data for snapshot.");
				return;
			}
			const logEntries = await this.loadProjectLogActivity(projectPath);
			const body = buildSnapshotMarkdown(
				this.app,
				projectPath,
				rollup,
				logEntries,
				this.settings,
			);
			const fullBlock = buildFullSnapshotBlock(body);
			await insertOrReplaceProjectSnapshot(this.app, f, fullBlock);
			new Notice("Project snapshot saved.");
		} catch (e) {
			console.error(e);
			new Notice("Could not save project snapshot.");
		}
	}

	openNewInlineTaskForProject(projectPath: string): void {
		const f = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(f instanceof TFile)) {
			new Notice("Project file not found.");
			return;
		}
		const tag = this.settings.taskTag.trim() || "task";
		new NewInlineTaskModal(this.app, f, tag, (title) => {
			void this.appendInlineTaskToProjectNote(f, title);
		}).open();
	}

	private async appendInlineTaskToProjectNote(projectFile: TFile, title: string): Promise<void> {
		const tag = this.settings.taskTag.trim() || "task";
		const linktext =
			this.app.metadataCache.fileToLinktext(projectFile, projectFile.path, false) ??
			projectFile.basename.replace(/\.md$/i, "");
		const line = `- [ ] ${title} #${tag} [[${linktext}]]`;
		try {
			const body = await this.app.vault.read(projectFile);
			const trimmed = body.replace(/\s*$/, "");
			const addition = `${trimmed.length > 0 ? "\n\n" : ""}${line}\n`;
			await this.app.vault.modify(projectFile, trimmed + addition);
			this.vaultIndex.scheduleRebuild();
			new Notice("Task added to project note.");
		} catch (e) {
			console.error(e);
			new Notice("Could not update the project note.");
		}
	}

	async createNewNoteFromTemplateForProject(
		projectPath: string,
		anchorLeaf?: WorkspaceLeaf,
	): Promise<void> {
		await runCreateNewNoteFromTemplate(
			this.app,
			this.settings,
			this.vaultIndex,
			projectPath,
			this.fulcrumCompanionLeaf,
			anchorLeaf,
		);
	}

	openTaskNoteCreateForProject(projectPath: string): void {
		const projectFile = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(projectFile instanceof TFile)) {
			new Notice("Project file not found.");
			return;
		}
		const linktext =
			this.app.metadataCache.fileToLinktext(projectFile, projectPath, false) ??
			projectFile.basename.replace(/\.md$/i, "");
		const projectWiki = `[[${linktext}]]`;
		const taskTag = this.settings.taskTag.trim() || "task";

		type TaskNotesPlugin = {openTaskCreationModal?: (v?: Record<string, unknown>) => void};
		const raw = (
			this.app as unknown as {plugins?: {plugins?: Record<string, unknown>}}
		).plugins?.plugins?.["tasknotes"] as TaskNotesPlugin | undefined;

		if (raw?.openTaskCreationModal) {
			raw.openTaskCreationModal({
				projects: [projectWiki],
				tags: [taskTag],
			});
			return;
		}

		const cmd = (
			this.app as unknown as {commands?: {executeCommandById(id: string): boolean}}
		).commands;
		if (!cmd?.executeCommandById("tasknotes:create-new-task")) {
			new Notice("Enable the TaskNotes plugin to create task notes from here.");
		}
	}
}
