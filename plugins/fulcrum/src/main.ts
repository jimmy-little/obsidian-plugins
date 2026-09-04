import {
	MarkdownRenderer,
	Menu,
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
	formatQuickNoteLogBlock,
	parseProjectLogLines,
	projectFileWikilink,
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
	revealOrCreateTasks,
	revealOrCreateDashboard,
	revealOrCreateToday,
	revealOrCreateLanding,
	revealOrCreateProjectManager,
	revealOrCreateQuickStart,
	revealOrCreateTimeTracked,
	revealOrCreateTimeline,
	revealOrCreateReview,
	revealOrCreateOrbit,
	openFloatingTimersPopout,
} from "./fulcrum/openViews";
import {openNotePropertiesModal, revealOrCreateView} from "@obsidian-suite/core";
import {
	buildPluginPersistedPayload,
	pruneTimerEntryCache,
} from "./fulcrum/pluginDataPrune";
import {DEFAULT_SETTINGS, DASHBOARD_ACTIVITY_MAX_DAYS, isDoneStatus, migrateTaskCardDisplaySettings, parseDoneStatusSet, parseList, parseTaskStatusChoices, type FulcrumSettings} from "./fulcrum/settingsDefaults";
import {migrateKanbanSettings} from "./fulcrum/kanban/settingsKey";
import {postTaskNotesToggleStatus} from "./fulcrum/taskNotesApi";
import {CreateTaskNoteModal} from "./fulcrum/modals";
import {openProjectCalendarTaskPicker} from "./fulcrum/calendar/calendarProjectAddTask";
import type {CalendarDropSlot} from "./fulcrum/calendar/calendarDropSlot";
import {slotStartMinutes} from "./fulcrum/calendar/calendarDropSlot";
import {formatSlotValue} from "./fulcrum/calendar/isoDateTime";
import {
	setInlineTaskDue,
	setInlineTaskScheduled,
} from "./fulcrum/utils/inlineTasks";
import type {TaskScheduleDateField} from "./fulcrum/kanban/taskFieldUpdate";
import {applyTaskStatusChange} from "./fulcrum/kanban/taskFieldUpdate";
import {
	handleRecurringTaskComplete,
	taskIsRecurring,
} from "./fulcrum/recurrence/recurrenceComplete";
import {taskIsDone} from "./fulcrum/taskCardInteractions";
import {toggleInlineTaskLine} from "./fulcrum/taskVaultToggle";
import {bumpSettingsRevision, bumpTimerRevision} from "./fulcrum/stores";
import {appendTimeBlockToDailyNote as appendTimeBlockLineToDailyNote} from "./fulcrum/utils/dailyPlannerEvents";
import {appendQuickNoteToDailyNote as appendQuickNoteLineToDailyNote} from "./fulcrum/today/dailyQuickNote";
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
import {registerInlineTaskLinkSuggestGuard} from "./fulcrum/inlineTaskLinkSuggestGuard";
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
import {registerConduitCommands} from "./conduit/actions";
import {
	CONDUIT_CONVERT_NOTICE_KEY,
	maybeShowConduitConvertNotice,
	registerConduitMigrationCommands,
} from "./conduit/conduitMigration";
import {openConnectRemindersListModal, clearProjectReminderList} from "./conduit/connectListModal";
import {ConduitService} from "./conduit/conduitService";
import {registerReminderQueryBlock} from "./conduit/reminderQueryBlock";
import {readProjectListId} from "./conduit/mapping";
import {
	convertInlineTaskToReminder,
	convertTaskNoteToReminder,
} from "./conduit/convertToReminder";
import type {RemindersBridge} from "./conduit/remindersBridge";
import {registerOmniFocusCommands} from "./omnifocus/commands";
import {openConnectOmniFocusProjectModal} from "./omnifocus/connectProjectModal";
import {OmniFocusClient} from "./omnifocus/client";
import {readProjectOmniId} from "./omnifocus/mapping";
import {clearProjectOmniFocusLink, OmniFocusSyncService} from "./omnifocus/syncService";
import type {OrbitHost} from "./orbit/orbit/pluginHost";
import {
	appendPersonQuickNote as appendPersonQuickNoteImpl,
	applyOrbitDeepLink,
	capturePersonSnapshot as capturePersonSnapshotImpl,
	initOrbitHost,
	mergeStandaloneOrbitPluginData,
	migrateOrbitSettings,
	openOrgChartForAnchor as openOrgChartForAnchorImpl,
	openPersonFile as openPersonFileImpl,
	openPersonInOrbitMode as openPersonInOrbitModeImpl,
	openPersonMarkdownFile as openPersonMarkdownFileImpl,
	openPersonProperties as openPersonPropertiesImpl,
	registerOrbitCommands,
	registerOrbitEvents,
	registerOrbitViews,
	renderOrbitActivityPreview as renderOrbitActivityPreviewImpl,
} from "./orbit/registerOrbit";

export default class FulcrumPlugin extends Plugin implements FulcrumHost {
	settings: FulcrumSettings = DEFAULT_SETTINGS;
	vaultIndex!: VaultIndex;
	timer!: TimerModule;
	conduit: ConduitService | null = null;
	omnifocus: OmniFocusSyncService | null = null;
	conduitConvertNoticeShown = false;
	orbitHost!: OrbitHost;
	/** Paths opened via Orbit "Open note" — skip auto profile routing until reopened. */
	readonly personMarkdownPreferred = new Set<string>();
	/** Reused markdown leaf for “open beside” from project / linked surfaces. */
	private readonly fulcrumCompanionLeaf: FulcrumCompanionLeaf = {current: null};

	async onload(): Promise<void> {
		this.register(injectFulcrumPluginStyles(FULCRUM_PLUGIN_CSS));

		await this.loadSettings();
		initOrbitHost(this);
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
		registerOrbitViews(this);

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
					this.vaultIndex.scheduleRebuildFromMetadataChange(f, {persisted: true});
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
				registerCleanup: (fn) => this.register(fn),
				timer: {
					findActiveEntryForFile: (filePath) => this.timer.findActiveEntryForFile(filePath),
					getActiveEntryElapsedMs: (entry) => this.timer.getActiveEntryElapsedMs(entry),
					formatTimeAsHHMMSS: (ms) => this.timer.formatTimeAsHHMMSS(ms),
				},
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
				openPersonFile: (file) => this.openPersonFile(file),
			},
			this.fulcrumCompanionLeaf,
		);

		registerTaskNoteChrome(this);

		registerInlineLinkPills(this, () => this.settings, () => this.vaultIndex);
		registerLivePreviewLinkPillScan(this, () => this.settings, () => this.vaultIndex);
		registerInlineTaskPills(this, () => this.settings);
		registerLivePreviewInlineTaskScan(this);
		const inlineTaskSuggest = registerInlineTaskEditorSuggest(
			this,
			() => this.settings,
			() => this.vaultIndex,
		);
		registerInlineTaskLinkSuggestGuard(this, () => this.settings, inlineTaskSuggest);

		registerOrbitEvents(this);
		registerOrbitCommands(this);

		this.addSettingTab(new FulcrumSettingTab(this.app, this));

		if (this.settings.showRibbonIcon) {
			this.addRibbonIcon(FULCRUM_PLUGIN_ICON, "Fulcrum Project Manager", () => {
				void this.openLanding();
			});
		}

		this.addCommand({
			id: "open-dashboard",
			name: "Open Project Manager",
			callback: () => {
				void this.openLanding();
			},
		});
		this.addCommand({
			id: "open-today",
			name: "Open Today",
			callback: () => {
				void this.openToday();
			},
		});
		this.addCommand({
			id: "open-dashboard-view",
			name: "Open Dashboard",
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
			id: "open-tasks",
			name: "Open tasks",
			callback: () => {
				void this.openTasks();
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
			name: "Repair plugin data (prune timer cache)",
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
		registerConduitMigrationCommands(this);
		registerReminderQueryBlock(this);
		registerOmniFocusCommands(this);

		this.registerObsidianProtocolHandler(this.manifest.id, (params) => {
			this.handleFulcrumOpenUri(params);
		});
		this.registerObsidianProtocolHandler("orbit", (params) => {
			void applyOrbitDeepLink(this, params).catch((err) => {
				console.error(err);
				new Notice("Orbit could not open that link.");
			});
		});

		this.app.workspace.onLayoutReady(() => {
			void maybeShowConduitConvertNotice(this, data);
			void this.restartConduit();
			void this.restartOmniFocus();
		});
	}

	onunload(): void {
		this.vaultIndex.cancelScheduledRebuild();
		this.conduit?.stop();
		this.conduit = null;
		this.omnifocus?.stop();
		this.omnifocus = null;
		void this.timer?.onunload();
	}

	async restartOmniFocus(): Promise<void> {
		this.omnifocus?.stop();
		this.omnifocus = null;
		if (!OmniFocusSyncService.canRun(this.settings)) return;
		this.omnifocus = new OmniFocusSyncService(this);
		await this.omnifocus.start();
	}

	omnifocusCanSync(): boolean {
		return OmniFocusSyncService.canRun(this.settings);
	}

	omnifocusIsProjectConnected(projectPath: string): boolean {
		if (this.omnifocus?.isProjectLinked(projectPath)) return true;
		const project = this.vaultIndex.resolveProjectByPath(projectPath);
		if (!project) return false;
		return !!readProjectOmniId(this.app, project, this.settings);
	}

	async omnifocusConnectProject(projectPath: string): Promise<void> {
		if (!OmniFocusSyncService.canRun(this.settings)) {
			new Notice("Enable OmniFocus sync in Fulcrum settings (macOS only).");
			return;
		}
		const project = this.vaultIndex.resolveProjectByPath(projectPath);
		if (!project) {
			new Notice("Project not found.");
			return;
		}
		try {
			const client = OmniFocusClient.fromSettings(this.settings);
			const projects = await client.projects();
			openConnectOmniFocusProjectModal(this, project, client, projects);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not load OmniFocus projects: ${msg}`);
		}
	}

	async omnifocusClearProject(projectPath: string): Promise<void> {
		if (!OmniFocusSyncService.canRun(this.settings)) return;
		try {
			await clearProjectOmniFocusLink(this, projectPath);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not clear OmniFocus project: ${msg}`);
		}
	}

	async omnifocusSyncNow(opts?: {projectPath?: string; projectOmniId?: string}): Promise<void> {
		if (!OmniFocusSyncService.canRun(this.settings)) {
			new Notice("Enable OmniFocus sync in Fulcrum settings (macOS only).");
			return;
		}
		const svc = this.omnifocus ?? new OmniFocusSyncService(this);
		this.omnifocus = svc;
		await svc.tick({force: true, notify: true, ...opts});
	}

	async omnifocusRunDoctor(): Promise<void> {
		const svc = this.omnifocus ?? new OmniFocusSyncService(this);
		await svc.runDoctor();
	}

	async restartConduit(): Promise<void> {
		this.conduit?.stop();
		this.conduit = null;
		if (!ConduitService.canRun(this.settings)) return;
		this.conduit = new ConduitService(this);
		await this.conduit.start();
	}

	async notifyConduitProjectCompleted(_projectPath: string): Promise<void> {
		// No-op: convert model does not archive Reminders lists on project complete.
	}

	conduitCanSync(): boolean {
		return ConduitService.canRun(this.settings);
	}

	async getRemindersBridge(): Promise<RemindersBridge> {
		const svc = this.conduit ?? new ConduitService(this);
		return svc.getBridge();
	}

	async conduitRunDoctor(): Promise<void> {
		const svc = this.conduit ?? new ConduitService(this);
		await svc.runDoctor();
	}

	conduitIsProjectConnected(projectPath: string): boolean {
		const svc = this.conduit;
		if (svc) return svc.isProjectConnected(projectPath);
		const project = this.vaultIndex.resolveProjectByPath(projectPath);
		if (!project) return false;
		return !!readProjectListId(this.app, project, this.settings);
	}

	async conduitConnectProject(projectPath: string): Promise<void> {
		if (!ConduitService.canRun(this.settings)) {
			new Notice("Enable the Reminders bridge in Fulcrum settings (macOS only).");
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

	async conduitClearProjectReminderList(projectPath: string): Promise<void> {
		if (!ConduitService.canRun(this.settings)) return;
		try {
			await clearProjectReminderList(this, projectPath);
			const svc = this.conduit ?? new ConduitService(this);
			await svc.refreshRemindersListCache();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not clear Reminders list: ${msg}`);
		}
	}

	async convertTaskToReminder(task: IndexedTask): Promise<void> {
		if (!ConduitService.canRun(this.settings)) {
			new Notice("Enable the Reminders bridge in Fulcrum settings (macOS only).");
			return;
		}
		const svc = this.conduit ?? new ConduitService(this);
		const bridge = await svc.getBridge();
		const lists = await svc.refreshRemindersListCache();
		if (task.source === "inline") {
			await convertInlineTaskToReminder(this, bridge, task, lists);
		} else if (task.source === "taskNote") {
			await convertTaskNoteToReminder(this, bridge, task, lists);
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
		if (!screen) screen = this.settings.landingPage === "dashboard" ? "dashboard" : "today";

		const projectPath = String(params.projectPath ?? "").trim();
		const focalDate = String(params.focalDate ?? params.date ?? "").trim();

		const timerTabByScreen: Record<string, TimeModeTab> = {
			reports: "sessions",
			sessions: "sessions",
			grid: "sessions",
			entry_grid: "sessions",
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
			case "today":
				await revealOrCreateToday(this.app, this.settings);
				return;
			case "tasks":
			case "areas":
				await revealOrCreateTasks(this.app, this.settings);
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
			case "orbit":
				await revealOrCreateOrbit(this.app, this.settings);
				return;
			case "person":
			case "profile": {
				const personPath = String(params.path ?? params.personPath ?? "").trim();
				if (!personPath) {
					new Notice("Fulcrum: add path= or personPath= (vault path to the person note).");
					return;
				}
				await revealOrCreateOrbit(this.app, this.settings, {
					personPath: normalizePath(personPath),
				});
				return;
			}
			case "org-chart":
			case "orgchart":
				await applyOrbitDeepLink(this, params);
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
		this.conduitConvertNoticeShown = raw?.[CONDUIT_CONVERT_NOTICE_KEY] === true;
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
		if (merged.landingPage !== "dashboard" && merged.landingPage !== "today") {
			merged.landingPage = DEFAULT_SETTINGS.landingPage;
		}
		if (typeof merged.todayWorldClocks !== "string") {
			merged.todayWorldClocks = DEFAULT_SETTINGS.todayWorldClocks;
		}
		if (typeof merged.todayWeatherLocation !== "string") {
			merged.todayWeatherLocation = DEFAULT_SETTINGS.todayWeatherLocation;
		}
		if (merged.todayWeatherUnits !== "celsius" && merged.todayWeatherUnits !== "fahrenheit") {
			merged.todayWeatherUnits = DEFAULT_SETTINGS.todayWeatherUnits;
		}
		if (
			merged.projectSidebarSortBy !== "end" &&
			merged.projectSidebarSortBy !== "nextReview" &&
			merged.projectSidebarSortBy !== "rank" &&
			merged.projectSidebarSortBy !== "name"
		) {
			merged.projectSidebarSortBy = DEFAULT_SETTINGS.projectSidebarSortBy;
		}
		const mergedRec = merged as Record<string, unknown>;
		if (mergedRec.projectSidebarSortBy === "launch") {
			merged.projectSidebarSortBy = "end";
		}
		if (typeof merged.projectEndDateField !== "string") {
			const legacyLaunch = mergedRec.projectLaunchDateField;
			merged.projectEndDateField =
				typeof legacyLaunch === "string" && legacyLaunch.trim()
					? legacyLaunch
					: DEFAULT_SETTINGS.projectEndDateField;
		}
		delete mergedRec.projectLaunchDateField;
		if (merged.projectSidebarSortDir !== "asc" && merged.projectSidebarSortDir !== "desc") {
			merged.projectSidebarSortDir = DEFAULT_SETTINGS.projectSidebarSortDir;
		}
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
		migrateKanbanSettings(merged as FulcrumSettings, loaded);
		if (!Array.isArray(merged.projectSidebarFilterUncheckedStatus)) {
			merged.projectSidebarFilterUncheckedStatus =
				DEFAULT_SETTINGS.projectSidebarFilterUncheckedStatus;
		}
		if (!Array.isArray(merged.taskSidebarFilterUncheckedStatus)) {
			merged.taskSidebarFilterUncheckedStatus =
				DEFAULT_SETTINGS.taskSidebarFilterUncheckedStatus;
		}
		if (typeof merged.areaLifeModeField !== "string" || !merged.areaLifeModeField.trim()) {
			merged.areaLifeModeField = DEFAULT_SETTINGS.areaLifeModeField;
		}
		if (!Array.isArray(merged.taskSidebarFilterUncheckedProject)) {
			merged.taskSidebarFilterUncheckedProject =
				DEFAULT_SETTINGS.taskSidebarFilterUncheckedProject;
		}
		if (!Array.isArray(merged.taskSidebarFilterUncheckedSource)) {
			merged.taskSidebarFilterUncheckedSource =
				DEFAULT_SETTINGS.taskSidebarFilterUncheckedSource;
		}
		if (typeof merged.conduitEnabled !== "boolean") {
			merged.conduitEnabled = DEFAULT_SETTINGS.conduitEnabled;
		}
		if (typeof merged.conduitRemctlPath !== "string") {
			merged.conduitRemctlPath = DEFAULT_SETTINGS.conduitRemctlPath;
		}
		if (typeof merged.remindersBridgeUrl !== "string") {
			merged.remindersBridgeUrl = DEFAULT_SETTINGS.remindersBridgeUrl;
		}
		if (typeof merged.remindersBridgeToken !== "string") {
			merged.remindersBridgeToken = DEFAULT_SETTINGS.remindersBridgeToken;
		}
		if (typeof merged.taskNotesArchiveFolder !== "string") {
			merged.taskNotesArchiveFolder = DEFAULT_SETTINGS.taskNotesArchiveFolder;
		}
		if (typeof merged.remindersQueryRefreshSeconds !== "number") {
			merged.remindersQueryRefreshSeconds = DEFAULT_SETTINGS.remindersQueryRefreshSeconds;
		}
		if (typeof merged.remindersCalendarIds !== "string") {
			merged.remindersCalendarIds = DEFAULT_SETTINGS.remindersCalendarIds;
		}
		if (typeof merged.forecastCalendarIds !== "string") {
			merged.forecastCalendarIds = DEFAULT_SETTINGS.forecastCalendarIds;
		}
		if (typeof merged.forecastShowVaultMeetings !== "boolean") {
			merged.forecastShowVaultMeetings = DEFAULT_SETTINGS.forecastShowVaultMeetings;
		}
		if (typeof merged.forecastShowSystemCalendars !== "boolean") {
			merged.forecastShowSystemCalendars = DEFAULT_SETTINGS.forecastShowSystemCalendars;
		}
		if (typeof merged.omnifocusEnabled !== "boolean") {
			merged.omnifocusEnabled = DEFAULT_SETTINGS.omnifocusEnabled;
		}
		if (typeof merged.omnifocusBridgeUrl !== "string") {
			merged.omnifocusBridgeUrl = DEFAULT_SETTINGS.omnifocusBridgeUrl;
		}
		if (typeof merged.omnifocusProjectIdField !== "string" || !merged.omnifocusProjectIdField.trim()) {
			merged.omnifocusProjectIdField = DEFAULT_SETTINGS.omnifocusProjectIdField;
		}
		if (typeof merged.omnifocusTaskIdField !== "string" || !merged.omnifocusTaskIdField.trim()) {
			merged.omnifocusTaskIdField = DEFAULT_SETTINGS.omnifocusTaskIdField;
		}
		if (typeof merged.omnifocusSyncedAtField !== "string" || !merged.omnifocusSyncedAtField.trim()) {
			merged.omnifocusSyncedAtField = DEFAULT_SETTINGS.omnifocusSyncedAtField;
		}
		if (typeof merged.omnifocusSyncHashField !== "string" || !merged.omnifocusSyncHashField.trim()) {
			merged.omnifocusSyncHashField = DEFAULT_SETTINGS.omnifocusSyncHashField;
		}
		if (typeof merged.omnifocusPollSeconds !== "number") {
			merged.omnifocusPollSeconds = DEFAULT_SETTINGS.omnifocusPollSeconds;
		}
		if (typeof merged.omnifocusSyncInbox !== "boolean") {
			merged.omnifocusSyncInbox = DEFAULT_SETTINGS.omnifocusSyncInbox;
		}
		if (merged.omnifocusEnabled && merged.conduitEnabled) {
			merged.conduitEnabled = false;
		}
		if (typeof merged.worldClocks !== "string") {
			merged.worldClocks = DEFAULT_SETTINGS.worldClocks;
		}
		delete (merged as Record<string, unknown>).conduitSyncOverrides;
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

		const legacyProjectActive = "planning, active, on-hold";
		if (merged.projectActiveStatuses?.trim() === legacyProjectActive) {
			merged.projectActiveStatuses = DEFAULT_SETTINGS.projectActiveStatuses;
		}

		if (!Array.isArray(merged.quickNoteThemes) || merged.quickNoteThemes.length === 0) {
			merged.quickNoteThemes = [...DEFAULT_SETTINGS.quickNoteThemes];
		}

		for (const legacyKey of [
			"kanbanHiddenStatus",
			"kanbanHiddenArea",
			"kanbanOrderStatus",
			"kanbanOrderArea",
			"projectTaskListGroupBy",
			"projectTaskListSortBy",
			"projectSidebarFilterUncheckedArea",
			"taskSidebarFilterUncheckedArea",
			"dateDisplayFormat",
			"completionThresholdPercent",
			"tasksPluginMode",
			"defaultProjectView",
			"taskNotesFolder",
			"taskNotesEnabled",
			"inlineTasksEnabled",
			"projectLaunchDateField",
			"conduitImportUnmapped",
			"conduitSyncOverrides",
			"conduitProjectListPairs",
			CONDUIT_CONVERT_NOTICE_KEY,
			"conduitEntityState",
		]) {
			delete mergedRec[legacyKey];
		}

		migrateOrbitSettings(merged as FulcrumSettings, loaded);
		mergeStandaloneOrbitPluginData(this, merged as FulcrumSettings);

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
			this.settings.timeModeTab !== "sessions"
		) {
			this.settings.timeModeTab = DEFAULT_SETTINGS.timeModeTab;
		}
		if ((this.settings.timeModeTab as string) === "activity") {
			this.settings.timeModeTab = "overview";
		}
		if ((this.settings.timeModeTab as string) === "entryGrid") {
			this.settings.timeModeTab = "overview";
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
		const payload = buildPluginPersistedPayload(
			{...this.settings} as Record<string, unknown>,
			this.timer?.entryCache ?? {},
		);
		if (this.conduitConvertNoticeShown) {
			payload[CONDUIT_CONVERT_NOTICE_KEY] = true;
		}
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

	/** Persist plugin meta flags without changing settings fields. */
	async savePluginMeta(): Promise<void> {
		await this.saveSettings();
	}

	async openTimeTracked(tab: TimeModeTab = this.settings.timeModeTab): Promise<void> {
		const normalized: TimeModeTab =
			(tab as string) === "entryGrid" || (tab as string) === "quickStart"
				? "overview"
				: tab;
		this.settings.timeModeTab = normalized;
		await this.saveSettings();
		await revealOrCreateTimeTracked(this.app, this.settings, normalized);
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

	async appendQuickNoteToDailyNote(dateIso: string, text: string): Promise<boolean> {
		const trimmed = text.trim();
		if (!trimmed) {
			new Notice("Write something to add to the daily note.");
			return false;
		}
		try {
			const file = await appendQuickNoteLineToDailyNote(this.app, dateIso.slice(0, 10), trimmed);
			if (!file) {
				new Notice("Could not update the daily note. Configure Daily Notes or Periodic Notes.");
				return false;
			}
			this.vaultIndex.scheduleRebuild();
			new Notice(`Appended to ${file.basename}.`);
			return true;
		} catch (e) {
			console.error(e);
			new Notice("Could not write to the daily note.");
			return false;
		}
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
			if (task.source === "taskNote" && taskIsRecurring(task)) {
				if (!taskIsDone(task, this.settings)) {
					await handleRecurringTaskComplete(this.app, task, this.settings);
				} else {
					const openStatus = parseTaskStatusChoices(this.settings)[0] ?? "todo";
					await applyTaskStatusChange(this.app, task, this.settings, openStatus);
				}
				await this.vaultIndex.rebuild();
				return;
			}

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

	async openPersonFile(file: TFile): Promise<void> {
		await openPersonFileImpl(this, file);
	}

	async openPersonMarkdownFile(file: TFile): Promise<void> {
		await openPersonMarkdownFileImpl(this, file);
	}

	async appendPersonQuickNote(personFile: TFile, text: string): Promise<void> {
		await appendPersonQuickNoteImpl(this, personFile, text);
	}

	async capturePersonSnapshot(personFile: TFile): Promise<void> {
		await capturePersonSnapshotImpl(this, personFile);
	}

	async renderOrbitActivityPreview(
		el: HTMLElement,
		sourcePath: string,
		markdown: string,
	): Promise<void> {
		await renderOrbitActivityPreviewImpl(this, el, sourcePath, markdown);
	}

	async openOrgChartForAnchor(anchorPath: string): Promise<void> {
		await openOrgChartForAnchorImpl(this, anchorPath);
	}

	async openPersonInOrbitMode(personPath: string): Promise<void> {
		await openPersonInOrbitModeImpl(this, personPath);
	}

	openPersonProperties(file: TFile): void {
		openPersonPropertiesImpl(this, file);
	}

	async openDashboard(): Promise<void> {
		await revealOrCreateDashboard(this.app, this.settings);
	}

	async openToday(): Promise<void> {
		await revealOrCreateToday(this.app, this.settings);
	}

	async openLanding(): Promise<void> {
		await revealOrCreateLanding(this.app, this.settings);
	}

	async openReview(): Promise<void> {
		await revealOrCreateReview(this.app, this.settings);
	}


	async openTasks(): Promise<void> {
		await revealOrCreateTasks(this.app, this.settings);
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

	async appendProjectLogEntry(
		projectPath: string,
		text: string,
		themeId?: string,
	): Promise<boolean> {
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
		const theme =
			themeId != null
				? this.settings.quickNoteThemes?.find((t) => t.id === themeId) ?? null
				: null;
		const block = formatQuickNoteLogBlock({
			text: trimmed,
			projectLink: projectFileWikilink(this.app, f),
			projectLinkField: this.settings.projectLinkField,
			theme,
		});
		try {
			await appendFulcrumProjectLog(
				this.app,
				f,
				this.settings.projectLogSectionHeading,
				block,
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
		this.openNewInlineTaskForProjectOnDate(projectPath);
	}

	openNewInlineTaskForProjectOnDate(projectPath: string, slot?: CalendarDropSlot): void {
		const f = this.app.vault.getAbstractFileByPath(projectPath);
		if (!(f instanceof TFile)) {
			new Notice("Project file not found.");
			return;
		}
		const tag = this.settings.taskTag.trim() || "task";
		new NewInlineTaskModal(this.app, f, tag, (title) => {
			void this.appendInlineTaskToProjectNote(f, title, slot);
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

	private async appendInlineTaskToProjectNote(
		projectFile: TFile,
		title: string,
		slot?: CalendarDropSlot,
		field: TaskScheduleDateField = "scheduled",
	): Promise<void> {
		const tag = this.settings.taskTag.trim() || "task";
		const linktext =
			this.app.metadataCache.fileToLinktext(projectFile, projectFile.path, false) ??
			projectFile.basename.replace(/\.md$/i, "");
		let line = `- [ ] ${title} #${tag} [[${linktext}]]`;
		if (slot) {
			const value = formatSlotValue(slot.dateIso, slotStartMinutes(slot));
			const withDate =
				field === "due"
					? setInlineTaskDue(line, value)
					: setInlineTaskScheduled(line, value);
			if (withDate) line = withDate;
		}
		try {
			const body = await this.app.vault.read(projectFile);
			const lines = body.split("\n");
			const headingLc = "## project tasks";
			const headingIdx = lines.findIndex((l) => l.trim().toLowerCase() === headingLc);

			if (headingIdx !== -1) {
				// Find the end of the task block under the heading
				let end = headingIdx + 1;
				for (let i = headingIdx + 1; i < lines.length; i++) {
					const trimmed = lines[i]!.trim();
					if (trimmed === "" || /^[-*+]\s*\[/.test(trimmed)) {
						end = i + 1;
					} else {
						break;
					}
				}
				lines.splice(end, 0, line);
			} else {
				// No heading — look for snapshot end marker
				const snapshotFooter = "<!-- Fulcrum snapshot end -->";
				const snapshotEndIdx = lines.findIndex((l) => l.trim() === snapshotFooter);
				if (snapshotEndIdx !== -1) {
					let insertAt = snapshotEndIdx + 1;
					if (insertAt < lines.length && lines[insertAt]!.trim() === "") insertAt++;
					lines.splice(insertAt, 0, "", "## Project Tasks", "", line);
				} else {
					// Append at end
					const trimmed = body.replace(/\s*$/, "");
					const newBody = `${trimmed}\n\n## Project Tasks\n\n${line}\n`;
					await this.app.vault.modify(projectFile, newBody);
					this.vaultIndex.scheduleRebuild();
					new Notice("Task added to project note.");
					return;
				}
			}

			await this.app.vault.modify(projectFile, lines.join("\n"));
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
		this.openCreateTaskNoteForProjectOnDate(projectPath);
	}

	openCreateTaskNoteForProjectOnDate(projectPath: string, slot?: CalendarDropSlot): void {
		new CreateTaskNoteModal(this.app, this, {
			projectPath,
			calendarDatePreset: slot,
		}).open();
	}

	openProjectCalendarAddTask(
		projectPath: string,
		slot: CalendarDropSlot,
		anchorEv?: MouseEvent,
	): void {
		const done = parseDoneStatusSet(this.settings.taskDoneStatuses);
		const tasks = this.vaultIndex
			.getSnapshot()
			.tasks.filter(
				(t) => t.projectFile?.path === projectPath && !isDoneStatus(t.status, done),
			);
		openProjectCalendarTaskPicker(this, projectPath, slot, tasks, anchorEv);
	}

	openNewTaskFromCalendarCell(
		projectPath: string,
		slot: CalendarDropSlot,
		anchorEv?: MouseEvent,
	): void {
		const mode = this.settings.taskSourceMode;
		const openInline = () => this.openNewInlineTaskForProjectOnDate(projectPath, slot);
		const openNote = () => this.openCreateTaskNoteForProjectOnDate(projectPath, slot);

		if (mode === "obsidianTasks") {
			openInline();
			return;
		}
		if (mode === "taskNotes") {
			openNote();
			return;
		}

		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("New task");
			item.setIcon("check");
			item.onClick(openInline);
		});
		menu.addItem((item) => {
			item.setTitle("New task note");
			item.setIcon("file-check");
			item.onClick(openNote);
		});
		if (anchorEv) {
			menu.showAtMouseEvent(anchorEv);
		} else {
			menu.showAtPosition({x: window.innerWidth / 2, y: window.innerHeight / 2});
		}
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
