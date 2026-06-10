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
	FULCRUM_PLUGIN_ICON,
	VIEW_ACTIVE_TIMERS,
	VIEW_DASHBOARD,
	VIEW_FLOATING_TIMERS,
	VIEW_PROJECT,
	VIEW_PROJECT_MANAGER,
	VIEW_QUICK_START,
	VIEW_TIMELINE,
} from "./fulcrum/constants";
import {
	AddMilestoneModal,
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
	revealOrCreateActiveTimers,
	revealOrCreateAreas,
	revealOrCreateDashboard,
	revealOrCreateProjectManager,
	revealOrCreateQuickStart,
	revealOrCreateTimeTracked,
	revealOrCreateTimeline,
	revealOrCreateReview,
	openFloatingTimersPopout,
} from "./fulcrum/openViews";
import {openNotePropertiesModal, revealOrCreateView} from "@obsidian-suite/core";
import {
	buildPluginPersistedPayload,
	pruneConduitSyncState,
	pruneTimerEntryCache,
} from "./fulcrum/pluginDataPrune";
import {loadConduitSyncState} from "./conduit/syncState";
import {DEFAULT_SETTINGS, DASHBOARD_ACTIVITY_MAX_DAYS, isDoneStatus, migrateTaskCardDisplaySettings, parseDoneStatusSet, parseList, parseTaskStatusChoices, type FulcrumSettings} from "./fulcrum/settingsDefaults";
import {migrateKanbanSettings} from "./fulcrum/kanban/settingsKey";
import {postTaskNotesToggleStatus} from "./fulcrum/taskNotesApi";
import {CreateTaskNoteModal} from "./fulcrum/modals";
import {applyTaskStatusChange} from "./fulcrum/kanban/taskFieldUpdate";
import {deleteConduitReminderForTask} from "./conduit/deleteReminderForTask";
import {toggleInlineTaskLine} from "./fulcrum/taskVaultToggle";
import {bumpSettingsRevision, bumpTimerRevision} from "./fulcrum/stores";
import {appendTimeBlockToDailyNote as appendTimeBlockLineToDailyNote} from "./fulcrum/utils/dailyPlannerEvents";
import type {IndexedPlannerEvent, IndexedTask} from "./fulcrum/types";
import {registerCompanionDocChrome} from "./fulcrum/companionDocChrome";
import {registerTaskNoteChrome} from "./fulcrum/taskNoteChrome";
import {
	registerInlineLinkPills,
	registerLivePreviewLinkPillScan,
} from "./fulcrum/inlineLinkPills";
import {transformActivityPreviewDom} from "./fulcrum/activityPreviewDom";
import {renderActivityTitleDom} from "./fulcrum/activityTitleDom";
import {createPersonNoteFile} from "./fulcrum/createPersonNote";
import {
	registerInlineTaskPills,
	registerLivePreviewInlineTaskScan,
} from "./fulcrum/inlineTaskPills";
import {registerInlineTaskEditorSuggest} from "./fulcrum/inlineTaskEditorSuggest";
import {convertInlineTaskAtLine} from "./fulcrum/convertInlineTaskToNote";
import {isCheckboxLine, isInlineTaskLineInScope} from "./fulcrum/utils/inlineTasks";
import {openMarkdownBesideFulcrum, type FulcrumCompanionLeaf} from "./fulcrum/openBesideFulcrum";
import {createNewNoteFromTemplateForProject as runCreateNewNoteFromTemplate} from "./fulcrum/projectNewNoteFromTemplate";
import {VaultIndex} from "./fulcrum/VaultIndex";
import {injectFulcrumPluginStyles} from "./fulcrum/injectPluginStyles";
import {FULCRUM_PLUGIN_CSS} from "./generated/pluginStyles";
import {FulcrumSettingTab} from "./settings";
import {TimerModule} from "./timer/TimerModule";
// Tabled: native macOS/iOS companion + widget bridge (see timer/WidgetBridge.ts, companion/).
// import {WidgetBridge} from "./timer/WidgetBridge";
import {migrateTimerSettings, mergeTimerDefaults} from "./timer/migration";
import type {TimeModeTab} from "./timer/types";
import {ActiveTimersView} from "./views/ActiveTimersView";
import {FloatingTimersView} from "./views/FloatingTimersView";
import {QuickStartView} from "./views/QuickStartView";
import {DashboardView} from "./views/DashboardView";
import {ProjectManagerView} from "./views/ProjectManagerView";
import {ProjectView} from "./views/ProjectView";
import {TimelineView} from "./views/TimelineView";
import {registerConduitCommands, runConduitAction, runConduitProjectAction} from "./conduit/actions";
import type {ConduitActionId} from "./conduit/actions";
import {openConnectRemindersListModal} from "./conduit/connectListModal";
import {ConduitService} from "./conduit/conduitService";
import {readProjectConduitSync, readProjectListId} from "./conduit/mapping";
import {
	disableProjectConduitSync,
	enableProjectConduitSyncIfLinked,
} from "./conduit/mappingRegistry";
import type {ConduitSyncForce} from "./conduit/types";

export default class FulcrumPlugin extends Plugin implements FulcrumHost {
	settings: FulcrumSettings = DEFAULT_SETTINGS;
	vaultIndex!: VaultIndex;
	timer!: TimerModule;
	conduit: ConduitService | null = null;
	/** Reused markdown leaf for “open beside” from project / linked surfaces. */
	private readonly fulcrumCompanionLeaf: FulcrumCompanionLeaf = {current: null};

	async onload(): Promise<void> {
		this.register(injectFulcrumPluginStyles(FULCRUM_PLUGIN_CSS));

		await this.loadSettings();
		this.vaultIndex = new VaultIndex(this.app, () => this.settings);
		this.timer = new TimerModule(this);
		const data = (await this.loadData()) as Record<string, unknown> | null;
		const cacheRaw = data?.timerEntryCache ?? data?.entryCache;
		const entryCache =
			cacheRaw && typeof cacheRaw === "object"
				? (cacheRaw as import("./timer/types").EntryCache)
				: {};
		const migrated = await migrateTimerSettings(this.app, this.settings.timer, entryCache);
		this.settings.timer = migrated.timer;
		this.timer.entryCache = pruneTimerEntryCache(migrated.entryCache);

		this.registerView(VIEW_PROJECT_MANAGER, (leaf) => new ProjectManagerView(leaf, this));
		this.registerView(VIEW_DASHBOARD, (leaf) => new DashboardView(leaf, this));
		this.registerView(VIEW_PROJECT, (leaf) => new ProjectView(leaf, this));
		this.registerView(VIEW_TIMELINE, (leaf) => new TimelineView(leaf, this));
		this.registerView(VIEW_ACTIVE_TIMERS, (leaf) => new ActiveTimersView(leaf, this));
		this.registerView(VIEW_QUICK_START, (leaf) => new QuickStartView(leaf, this));
		this.registerView(VIEW_FLOATING_TIMERS, (leaf) => new FloatingTimersView(leaf, this));

		try {
			await this.timer.onload();
		} catch (err) {
			console.error("Fulcrum timer failed to load", err);
			new Notice("Fulcrum timer failed to load — time tracking is unavailable.");
		}

		this.registerHoverLinkSource(FULCRUM_HOVER_SOURCE, {
			display: this.manifest.name,
			defaultMod: false,
		});

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.vaultIndex.scheduleRebuildFromMetadataChange(file);
				}
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
				startTimerInOpenNote: (file, meta) =>
					this.startTimerInNote(file.path, {
						projectName: meta.projectLabel,
						noteTitle: meta.entryTitle,
					}),
				openNoteProperties: (file) => {
					openNotePropertiesModal(this.app, file, {
						displayTitleField: this.settings.atomicNoteEntryField,
					});
				},
				openProjectSummary: (path) => this.openProjectSummary(path),
				createPersonNote: (linkText, displayName) =>
					this.createPersonNote(linkText, displayName),
			},
			this.fulcrumCompanionLeaf,
		);

		registerTaskNoteChrome(this);

		registerInlineLinkPills(this, () => this.settings, () => this.vaultIndex);
		registerLivePreviewLinkPillScan(this, () => this.settings, () => this.vaultIndex);
		registerInlineTaskPills(this, () => this.settings);
		registerLivePreviewInlineTaskScan(this);
		registerInlineTaskEditorSuggest(this, () => this.settings, () => this.vaultIndex);

		this.addSettingTab(new FulcrumSettingTab(this.app, this));

		if (this.settings.showRibbonIcon) {
			this.addRibbonIcon(FULCRUM_PLUGIN_ICON, "Fulcrum Project Manager", () => {
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
			id: "new-task-note",
			name: "New task note",
			checkCallback: (checking) => {
				const mode = this.settings.taskSourceMode;
				if (mode !== "taskNotes" && mode !== "both") return false;
				if (!checking) this.promptCreateTaskNoteForProject();
				return true;
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
		this.addCommand({
			id: "repair-plugin-data",
			name: "Repair plugin data (prune timer cache & Conduit state)",
			callback: () => {
				void this.repairPluginPersistedData();
			},
		});
		this.addCommand({
			id: "open-floating-timers",
			name: "Open Floating Timers View",
			callback: () => {
				void this.openFloatingTimers();
			},
		});
		this.addCommand({
			id: "convert-inline-task-to-note",
			name: "Convert inline task to note",
			editorCheckCallback: (checking, editor, view) => {
				const file = view.file;
				if (!file) return false;
				const lineNo = editor.getCursor().line;
				const lineText = editor.getLine(lineNo);
				if (!isCheckboxLine(lineText)) return false;
				if (!isInlineTaskLineInScope(file.path, this.settings)) return false;
				if (!checking) {
					void convertInlineTaskAtLine(this, file, lineNo);
				}
				return true;
			},
		});

		registerConduitCommands(this);

		this.registerObsidianProtocolHandler(this.manifest.id, (params) => {
			this.handleFulcrumOpenUri(params);
		});

		this.app.workspace.onLayoutReady(() => {
			void this.restartConduit();
		});
	}

	onunload(): void {
		this.vaultIndex.cancelScheduledRebuild();
		this.conduit?.stop();
		this.conduit = null;
		void this.timer?.onunload();
	}

	async restartConduit(): Promise<void> {
		this.conduit?.stop();
		this.conduit = null;
		if (!ConduitService.canRun(this.settings)) return;
		this.conduit = new ConduitService(this);
		await this.conduit.start();
	}

	async notifyConduitProjectCompleted(projectPath: string): Promise<void> {
		await this.conduit?.onProjectCompleted(projectPath);
	}

	conduitCanSync(): boolean {
		return ConduitService.canRun(this.settings);
	}

	async deleteConduitReminderForTask(task: IndexedTask): Promise<void> {
		await deleteConduitReminderForTask(this.app, this.settings, task);
	}

	async conduitSyncNow(opts?: {
		force?: ConduitSyncForce;
		skipQuiet?: boolean;
		projectPath?: string;
	}): Promise<void> {
		const svc = this.conduit ?? new ConduitService(this);
		await svc.syncNow(opts);
	}

	async conduitRunDoctor(): Promise<void> {
		const svc = this.conduit ?? new ConduitService(this);
		await svc.runDoctor();
	}

	conduitRunAction(id: ConduitActionId): void {
		runConduitAction(this, id);
	}

	conduitRunProjectAction(projectPath: string, id: "sync" | "pull" | "push"): void {
		runConduitProjectAction(this, projectPath, id);
	}

	conduitIsProjectConnected(projectPath: string): boolean {
		const svc = this.conduit;
		if (svc) return svc.isProjectConnected(projectPath);
		const project = this.vaultIndex.resolveProjectByPath(projectPath);
		if (!project) return false;
		return !!readProjectListId(this.app, project, this.settings);
	}

	conduitIsProjectSyncEnabled(projectPath: string): boolean {
		const svc = this.conduit;
		if (svc) return svc.isProjectSyncEnabled(projectPath);
		const project = this.vaultIndex.resolveProjectByPath(projectPath);
		if (!project) return false;
		return (
			readProjectConduitSync(this.app, project, this.settings) &&
			!!readProjectListId(this.app, project, this.settings)
		);
	}

	async conduitConnectProject(projectPath: string): Promise<void> {
		if (!ConduitService.canRun(this.settings)) {
			new Notice("Enable Conduit in Fulcrum settings (macOS only).");
			return;
		}
		const project = this.vaultIndex.resolveProjectByPath(projectPath);
		if (!project) {
			new Notice("Project not found.");
			return;
		}
		const svc = this.conduit ?? new ConduitService(this);
		try {
			const lists = await svc.refreshRemindersListCache();
			openConnectRemindersListModal(this, project, lists);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not load Reminders lists: ${msg}`);
		}
	}

	async conduitStartRemindersSync(projectPath: string): Promise<void> {
		if (!ConduitService.canRun(this.settings)) {
			new Notice("Enable Conduit in Fulcrum settings (macOS only).");
			return;
		}
		try {
			const enabled = await enableProjectConduitSyncIfLinked(this, projectPath);
			if (!enabled) {
				await this.conduitConnectProject(projectPath);
			}
			const svc = this.conduit ?? new ConduitService(this);
			await svc.refreshRemindersListCache();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not enable Reminders sync: ${msg}`);
		}
	}

	async conduitStopRemindersSync(projectPath: string): Promise<void> {
		if (!ConduitService.canRun(this.settings)) return;
		try {
			await disableProjectConduitSync(this, projectPath);
			const svc = this.conduit ?? new ConduitService(this);
			await svc.refreshRemindersListCache();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not stop Reminders sync: ${msg}`);
		}
	}

	private handleFulcrumOpenUri(params: ObsidianProtocolData): void {
		void this.applyFulcrumDeepLink(params).catch((err) => {
			console.error(err);
			new Notice("Fulcrum could not open that link.");
		});
	}

	private async applyFulcrumDeepLink(params: ObsidianProtocolData): Promise<void> {
		const action = String(params.action ?? "")
			.trim()
			.toLowerCase();
		if (action === "open_task") {
			const path = String(params.path ?? params.file ?? "").trim();
			const vaultParam = String(params.vault ?? "").trim();
			if (vaultParam && vaultParam !== this.app.vault.getName()) {
				new Notice("Fulcrum: link targets a different vault.");
				return;
			}
			if (!path) {
				new Notice("Fulcrum: open_task requires path= vault-relative file path.");
				return;
			}
			const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
			if (!(file instanceof TFile)) {
				new Notice("Fulcrum: task note not found in this vault.");
				return;
			}
			await this.app.workspace.getLeaf(false).openFile(file);
			return;
		}

		const screenRaw = String(params.screen ?? params.leaf ?? "")
			.trim()
			.toLowerCase()
			.replace(/-/g, "_");
		const route = String(params.route ?? "")
			.trim()
			.replace(/^\/+/, "");
		let screen = screenRaw;
		if (!screen && route) {
			const tail = route
				.replace(/^fulcrum\//i, "")
				.replace(/^lapse\//i, "")
				.replace(/^fulcrum-timer-tracker\//i, "");
			const seg = tail.split("/")[0] ?? "";
			screen = seg.toLowerCase().replace(/-/g, "_");
		}
		if (!screen) screen = "dashboard";

		const projectPath = String(params.projectPath ?? "").trim();
		const focalDate = String(params.focalDate ?? params.date ?? "").trim();

		const timerTabByScreen: Record<string, TimeModeTab> = {
			reports: "sessions",
			sessions: "sessions",
			grid: "entryGrid",
			entry_grid: "entryGrid",
		};
		if (screen === "activity" || screen === "sidebar") {
			await this.openActiveTimers();
			return;
		}
		if (screen === "quick_start" || screen === "quickstart" || screen === "buttons") {
			await this.openQuickStart();
			return;
		}
		if (screen === "floating_timers" || screen === "floating") {
			await this.openFloatingTimers();
			return;
		}
		const timerTab = timerTabByScreen[screen];
		if (timerTab) {
			await this.openTimeTracked(timerTab);
			return;
		}

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
		const mergedRec = merged as Record<string, unknown>;
		if (mergedRec.projectSidebarSortBy === "end") {
			merged.projectSidebarSortBy = "launch";
		}
		if (typeof merged.projectEndDateField !== "string") {
			const legacyLaunch = mergedRec.projectLaunchDateField;
			merged.projectEndDateField =
				typeof legacyLaunch === "string" && legacyLaunch.trim()
					? legacyLaunch
					: DEFAULT_SETTINGS.projectEndDateField;
		}
		delete mergedRec.projectLaunchDateField;
		if (typeof merged.projectRankField !== "string") {
			merged.projectRankField = DEFAULT_SETTINGS.projectRankField;
		}
		if (
			merged.kanbanColumnBy !== "status" &&
			merged.kanbanColumnBy !== "area" &&
			merged.kanbanColumnBy !== "project" &&
			merged.kanbanColumnBy !== "date"
		) {
			merged.kanbanColumnBy = DEFAULT_SETTINGS.kanbanColumnBy;
		}
		if (merged.kanbanView !== "projects" && merged.kanbanView !== "tasks") {
			merged.kanbanView = DEFAULT_SETTINGS.kanbanView;
		}
		if (
			merged.kanbanSwimlaneBy !== "none" &&
			merged.kanbanSwimlaneBy !== "status" &&
			merged.kanbanSwimlaneBy !== "area" &&
			merged.kanbanSwimlaneBy !== "project" &&
			merged.kanbanSwimlaneBy !== "date"
		) {
			merged.kanbanSwimlaneBy = DEFAULT_SETTINGS.kanbanSwimlaneBy;
		}
		if (
			merged.kanbanProjectDateSource !== "nextReview" &&
			merged.kanbanProjectDateSource !== "deadline"
		) {
			merged.kanbanProjectDateSource = DEFAULT_SETTINGS.kanbanProjectDateSource;
		}
		if (typeof merged.projectDeadlineField !== "string") {
			merged.projectDeadlineField = DEFAULT_SETTINGS.projectDeadlineField;
		}
		if (
			!merged.kanbanHiddenColumns ||
			typeof merged.kanbanHiddenColumns !== "object" ||
			Array.isArray(merged.kanbanHiddenColumns)
		) {
			merged.kanbanHiddenColumns = {...DEFAULT_SETTINGS.kanbanHiddenColumns};
		}
		if (
			!merged.kanbanColumnOrder ||
			typeof merged.kanbanColumnOrder !== "object" ||
			Array.isArray(merged.kanbanColumnOrder)
		) {
			merged.kanbanColumnOrder = {...DEFAULT_SETTINGS.kanbanColumnOrder};
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
		migrateKanbanSettings(merged as FulcrumSettings);
		if (!Array.isArray(merged.projectSidebarFilterUncheckedStatus)) {
			merged.projectSidebarFilterUncheckedStatus =
				DEFAULT_SETTINGS.projectSidebarFilterUncheckedStatus;
		}
		if (!Array.isArray(merged.projectSidebarFilterUncheckedArea)) {
			merged.projectSidebarFilterUncheckedArea =
				DEFAULT_SETTINGS.projectSidebarFilterUncheckedArea;
		}
		if (!Array.isArray(merged.taskSidebarFilterUncheckedStatus)) {
			merged.taskSidebarFilterUncheckedStatus =
				DEFAULT_SETTINGS.taskSidebarFilterUncheckedStatus;
		}
		if (!Array.isArray(merged.taskSidebarFilterUncheckedArea)) {
			merged.taskSidebarFilterUncheckedArea = DEFAULT_SETTINGS.taskSidebarFilterUncheckedArea;
		}
		if (typeof merged.areaLifeModeField !== "string" || !merged.areaLifeModeField.trim()) {
			merged.areaLifeModeField = DEFAULT_SETTINGS.areaLifeModeField;
		}
		if (!Array.isArray(merged.taskSidebarFilterUncheckedProject)) {
			merged.taskSidebarFilterUncheckedProject =
				DEFAULT_SETTINGS.taskSidebarFilterUncheckedProject;
		}
		if (typeof merged.conduitEnabled !== "boolean") {
			merged.conduitEnabled = DEFAULT_SETTINGS.conduitEnabled;
		}
		if (typeof merged.conduitRemctlPath !== "string") {
			merged.conduitRemctlPath = DEFAULT_SETTINGS.conduitRemctlPath;
		}
		if (typeof merged.conduitVaultNameOverride !== "string") {
			merged.conduitVaultNameOverride = DEFAULT_SETTINGS.conduitVaultNameOverride;
		}
		if (typeof merged.conduitSyncIntervalSeconds !== "number") {
			merged.conduitSyncIntervalSeconds = DEFAULT_SETTINGS.conduitSyncIntervalSeconds;
		}
		if (typeof merged.conduitVaultQuietSeconds !== "number") {
			merged.conduitVaultQuietSeconds = DEFAULT_SETTINGS.conduitVaultQuietSeconds;
		}
		if (typeof merged.conduitShowSyncProgress !== "boolean") {
			merged.conduitShowSyncProgress = DEFAULT_SETTINGS.conduitShowSyncProgress;
		}
		if (typeof merged.conduitSyncField !== "string" || !merged.conduitSyncField.trim()) {
			merged.conduitSyncField = DEFAULT_SETTINGS.conduitSyncField;
		}
		delete (merged as Record<string, unknown>).conduitImportUnmapped;
		delete (merged as Record<string, unknown>).conduitSyncOverrides;
		delete (merged as Record<string, unknown>).conduitProjectListPairs;
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

		migrateTaskCardDisplaySettings(merged as FulcrumSettings & Record<string, unknown>);

		this.settings = merged as FulcrumSettings;

		const cacheInSettings = (loaded as Record<string, unknown>).timerEntryCache ??
			(loaded as Record<string, unknown>).entryCache;
		if (cacheInSettings && typeof cacheInSettings === "object") {
			const pruned = pruneTimerEntryCache(cacheInSettings as import("./timer/types").EntryCache);
			if (Object.keys(pruned).length !== Object.keys(cacheInSettings as object).length) {
				console.warn(
					`Fulcrum: pruned timer entry cache (${Object.keys(cacheInSettings as object).length} → ${Object.keys(pruned).length} files).`,
				);
			}
		}

		this.settings.timer = mergeTimerDefaults(
			typeof loaded.timer === "object" && loaded.timer
				? (loaded.timer as Partial<typeof DEFAULT_SETTINGS.timer>)
				: undefined,
		);
		if (
			this.settings.timeModeTab !== "overview" &&
			this.settings.timeModeTab !== "activity" &&
			this.settings.timeModeTab !== "sessions" &&
			this.settings.timeModeTab !== "entryGrid"
		) {
			this.settings.timeModeTab = DEFAULT_SETTINGS.timeModeTab;
		}
		if ((this.settings.timeModeTab as string) === "quickStart") {
			this.settings.timeModeTab = "overview";
		}
	}

	/** Prune oversized timer cache / Conduit map and rewrite data.json (requires valid JSON on disk). */
	async repairPluginPersistedData(): Promise<void> {
		try {
			const before = (await this.loadData()) as Record<string, unknown> | null;
			if (!before) {
				new Notice("Fulcrum: no plugin data file — nothing to repair.");
				return;
			}
			const cacheRaw = before.timerEntryCache ?? before.entryCache;
			if (cacheRaw && typeof cacheRaw === "object") {
				this.timer.entryCache = pruneTimerEntryCache(cacheRaw as import("./timer/types").EntryCache);
			}
			await this.saveSettings();
			new Notice("Fulcrum: plugin data pruned and saved.");
		} catch (e) {
			console.error(e);
			new Notice(
				"Fulcrum: could not repair data.json — quit Obsidian and fix or delete .obsidian/plugins/fulcrum/data.json (see console).",
			);
		}
	}

	async saveSettings(): Promise<void> {
		if (this.settings.timer.totalTimeKey !== this.settings.taskTrackedMinutesField) {
			this.settings.timer.totalTimeKey = this.settings.taskTrackedMinutesField;
		}
		const conduitRaw = (await this.loadData()) as Record<string, unknown> | null;
		let conduitSync = await loadConduitSyncState(() => Promise.resolve(conduitRaw));
		conduitSync = pruneConduitSyncState(this.app, conduitSync);
		const payload = buildPluginPersistedPayload(
			{...this.settings} as Record<string, unknown>,
			this.timer?.entryCache ?? {},
			conduitSync,
		);
		try {
			await this.saveData(payload);
		} catch (e) {
			console.error("Fulcrum: failed to save plugin data", e);
			new Notice(
				"Fulcrum could not save settings — plugin data may be too large or corrupt. See console.",
			);
			throw e;
		}
	}

	async openTimeTracked(tab: TimeModeTab = this.settings.timeModeTab): Promise<void> {
		this.settings.timeModeTab = tab;
		await this.saveSettings();
		await revealOrCreateTimeTracked(this.app, this.settings, tab);
	}

	async openActiveTimers(): Promise<void> {
		await revealOrCreateActiveTimers(this.app, this.settings);
	}

	async openQuickStart(): Promise<void> {
		await revealOrCreateQuickStart(this.app, this.settings);
	}

	async openFloatingTimers(): Promise<void> {
		await openFloatingTimersPopout(this.app);
	}

	async openCalendar(): Promise<void> {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_PROJECT_MANAGER)[0];
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_PROJECT_MANAGER,
				active: true,
				state: {mode: "calendar"},
			});
			await this.app.workspace.revealLeaf(leaf);
			return;
		}
		await revealOrCreateProjectManager(this.app, this.settings, {mode: "calendar"});
	}

	async startTimerForProject(projectName: string, projectFilePath: string): Promise<void> {
		await this.timer.startTimerForProject(projectName, projectFilePath);
	}

	async startTimerInNote(
		notePath: string,
		options?: {projectName?: string | null; noteTitle?: string | null},
	): Promise<void> {
		await this.timer.startTimerInNote(notePath, options);
	}

	async stopTimerInNote(notePath: string): Promise<void> {
		const stopped = await this.timer.stopAllActiveEntriesInFile(notePath);
		if (!stopped) return;
		this.timer.refreshActivityPanel();
		this.bumpTimerRevision();
	}

	async patchSettings(partial: Partial<FulcrumSettings>): Promise<void> {
		Object.assign(this.settings, partial);
		await this.saveSettings();
		bumpSettingsRevision();
	}

	bumpTimerRevision(): void {
		bumpTimerRevision();
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

	async appendTimeBlockToDailyNote(
		dateIso: string,
		anchorLeaf?: WorkspaceLeaf,
	): Promise<void> {
		const result = await appendTimeBlockLineToDailyNote(
			this.app,
			this.settings,
			dateIso.slice(0, 10),
		);
		if (!result) {
			new Notice(
				"Could not add a time block. Enable Daily note planner in Fulcrum settings and configure Daily Notes or Periodic Notes.",
			);
			return;
		}
		this.vaultIndex.scheduleRebuild();
		const lineState = {
			state: {line: result.line} as Record<string, unknown>,
			eState: {line: result.line} as Record<string, unknown>,
		};
		void openMarkdownBesideFulcrum(
			this.app,
			anchorLeaf,
			result.file,
			this.fulcrumCompanionLeaf,
			lineState,
		);
	}

	openPlannerEvent(event: IndexedPlannerEvent, anchorLeaf?: WorkspaceLeaf): void {
		const f = this.app.vault.getAbstractFileByPath(event.file.path);
		if (!(f instanceof TFile)) return;
		const lineState = {
			state: {line: event.line} as Record<string, unknown>,
			eState: {line: event.line} as Record<string, unknown>,
		};
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
					const done = parseDoneStatusSet(this.settings.taskDoneStatuses);
					const isDone = isDoneStatus(task.status, done);
					const openStatus = parseTaskStatusChoices(this.settings)[0] ?? "todo";
					const doneStatus = parseList(this.settings.taskDoneStatuses)[0] ?? "done";
					await applyTaskStatusChange(
						this.app,
						task,
						this.settings,
						isDone ? openStatus : doneStatus,
					);
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
		el.addClass("markdown-preview-view");
		await MarkdownRenderer.render(this.app, markdown, el, sourcePath, this);
		transformActivityPreviewDom(this.app, el, sourcePath, this.settings, this.vaultIndex);
	}

	renderActivityTitleInline(el: HTMLElement, sourcePath: string, title: string): void {
		renderActivityTitleDom(
			this.app,
			el,
			title,
			sourcePath,
			this.settings,
			this.vaultIndex,
		);
	}

	async createPersonNote(linkText: string, displayName: string): Promise<void> {
		const file = await createPersonNoteFile(this.app, this.settings, {
			linkText,
			displayName,
		});
		if (file) {
			await this.vaultIndex.rebuild();
		}
	}

	async openDashboard(): Promise<void> {
		await revealOrCreateDashboard(this.app, this.settings);
	}

	async openReview(): Promise<void> {
		await revealOrCreateReview(this.app, this.settings);
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

	openAddMilestoneModal(
		projectPath: string,
		onComplete?: () => void | Promise<void>,
	): void {
		new AddMilestoneModal(this.app, this, projectPath, onComplete).open();
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

	promptNewInlineTaskForProject(): void {
		const projects = this.vaultIndex.getSnapshot().projects;
		if (projects.length === 0) {
			new Notice("No projects in the index yet.");
			return;
		}
		new ProjectPickerModal(this.app, projects, (p) => {
			this.openNewInlineTaskForProject(p.file.path);
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
		this.openCreateTaskNoteForProject(projectPath);
	}

	openCreateTaskNoteForProject(projectPath: string): void {
		new CreateTaskNoteModal(this.app, this, {projectPath}).open();
	}

	promptCreateTaskNoteForProject(): void {
		const projects = this.vaultIndex.getSnapshot().projects;
		if (projects.length === 0) {
			new Notice("No projects in the index yet.");
			return;
		}
		new ProjectPickerModal(this.app, projects, (p) => {
			this.openCreateTaskNoteForProject(p.file.path);
		}).open();
	}

	openCreateSubtaskForTask(parent: IndexedTask): void {
		new CreateTaskNoteModal(this.app, this, {parentTask: parent}).open();
	}
}
