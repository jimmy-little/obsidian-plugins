import type {App, WorkspaceLeaf} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {VaultIndex} from "./VaultIndex";
import type {IndexedPlannerEvent, IndexedTask} from "./types";
import type {ProjectLogActivityEntry} from "./projectNote";
import type {TimerModule} from "../timer/TimerModule";
import type {TimeModeTab} from "../timer/types";

/** Narrow surface passed into Svelte views (avoids circular imports). */
export interface FulcrumHost {
	readonly app: App;
	readonly settings: FulcrumSettings;
	readonly vaultIndex: VaultIndex;
	readonly timer: TimerModule;
	openProjectSummary(path: string): Promise<void>;
	openDashboard(): Promise<void>;
	openReview(): Promise<void>;
	openTimeTracked(tab?: TimeModeTab): Promise<void>;
	openActiveTimers(): Promise<void>;
	openQuickStart(): Promise<void>;
	/** Desktop pop-out: active timers + quick start. */
	openFloatingTimers(): Promise<void>;
	openCalendar(): Promise<void>;
	startTimerForProject(projectName: string, projectFilePath: string): Promise<void>;
	startTimerInNote(
		notePath: string,
		options?: {projectName?: string | null; noteTitle?: string | null},
	): Promise<void>;
	stopTimerInNote(notePath: string): Promise<void>;
	refreshIndex(): Promise<void>;
	appendProjectLogEntry(projectPath: string, text: string): Promise<boolean>;
	/** Opens modal: optional review note, updates review dates, appends Fulcrum log line. */
	openMarkReviewedModal(
		projectPath: string,
		onComplete?: () => void | Promise<void>,
	): void;
	openAddMilestoneModal(
		projectPath: string,
		onComplete?: () => void | Promise<void>,
	): void;
	/** Modal: text → same log append as the project page quick note (does not open the project). */
	openQuickProjectNoteModal(projectPath: string): void;
	/** Confirm, optional note → done status, log line, move to completed folder, return to dashboard. */
	openMarkProjectCompleteModal(
		projectPath: string,
		onComplete?: () => void | Promise<void>,
	): void;
	/** Change project status: pick status, confirm with Set Frontmatter / Update Folder toggles. */
	openChangeProjectStatusModal(
		projectPath: string,
		currentStatus: string,
		onComplete?: (newPath?: string) => void | Promise<void>,
	): void;
	loadProjectLogPreview(projectPath: string): Promise<string[]>;
	loadProjectLogActivity(projectPath: string): Promise<ProjectLogActivityEntry[]>;
	/** Capture project stats, tasks, meetings, and activity as static markdown in the project note. */
	archiveProjectSnapshot(projectPath: string): Promise<void>;
	/** Append `- [ ] title #tag [[project]]` to the project note (Obsidian Tasks / inline source). */
	openNewInlineTaskForProject(projectPath: string): void;
	/** Pick a project, then append an inline checkbox task to its note. */
	promptNewInlineTaskForProject(): void;
	/** TaskNotes “Create new task” with project pre-filled when the plugin exposes it. */
	openTaskNoteCreateForProject(projectPath: string): void;
	/** Create a TaskNotes-compatible task note (Fulcrum-native). */
	openCreateTaskNoteForProject(projectPath: string): void;
	/** Pick a project, then open the create task note modal. */
	promptCreateTaskNoteForProject(): void;
	/** Create subtask linked to parent task note. */
	openCreateSubtaskForTask(parent: IndexedTask): void;
	/** Create a note from the configured template; opens beside the project view when possible. */
	createNewNoteFromTemplateForProject(
		projectPath: string,
		anchorLeaf?: WorkspaceLeaf,
	): Promise<void>;
	/**
	 * Open a vault path for editing beside the Fulcrum leaf when possible (split right; reuse pane).
	 * Falls back to a new tab without an anchor (e.g. mobile).
	 */
	openLinkedNoteFromFulcrum(path: string, anchorLeaf?: WorkspaceLeaf): void;
	openIndexedTask(task: IndexedTask, anchorLeaf?: WorkspaceLeaf): void;
	openPlannerEvent(event: IndexedPlannerEvent, anchorLeaf?: WorkspaceLeaf): void;
	/** Append a new timed line under the daily-note planner heading for the given day. */
	appendTimeBlockToDailyNote(dateIso: string, anchorLeaf?: WorkspaceLeaf): Promise<void>;
	toggleIndexedTask(task: IndexedTask): Promise<void>;
	patchSettings(partial: Partial<FulcrumSettings>): Promise<void>;
	triggerFulcrumHoverLink(
		event: MouseEvent,
		hoverParent: WorkspaceLeaf,
		targetEl: HTMLElement,
		path: string,
	): void;
	/** After project marked complete — archives empty Reminders list when Conduit is enabled. */
	notifyConduitProjectCompleted(projectPath: string): Promise<void>;
	/** macOS + Conduit enabled — show Reminders sync toolbar. */
	conduitCanSync(): boolean;
	deleteConduitReminderForTask(task: IndexedTask): Promise<void>;
	conduitSyncNow(opts?: {
		force?: import("../conduit/types").ConduitSyncForce;
		skipQuiet?: boolean;
		projectPath?: string;
	}): Promise<void>;
	conduitRunDoctor(): Promise<void>;
	conduitRunAction(id: import("../conduit/actions").ConduitActionId): void;
	conduitRunProjectAction(projectPath: string, id: "sync" | "pull" | "push"): void;
	conduitIsProjectConnected(projectPath: string): boolean;
	conduitIsProjectSyncEnabled(projectPath: string): boolean;
	conduitConnectProject(projectPath: string): Promise<void>;
	conduitStartRemindersSync(projectPath: string): Promise<void>;
	conduitStopRemindersSync(projectPath: string): Promise<void>;
	/** Tabled: native widget bridge — see timer/WidgetBridge.ts */
	// scheduleWidgetBridgeSync?(): void;
	/** Renders markdown into a host element (e.g. activity note preview). */
	renderActivityBodyPreview(el: HTMLElement, sourcePath: string, markdown: string): Promise<void>;
	/** Renders a single-line title with wikilinks as inline pills (no markdown block layout). */
	renderActivityTitleInline(el: HTMLElement, sourcePath: string, title: string): void;
	/** Create a people-folder note from a ghost wikilink and open it. */
	createPersonNote(linkText: string, displayName: string): Promise<void>;
	/** Edit project note YAML in the suite properties modal (same UI as Orbit). */
	openProjectNoteProperties(projectPath: string): void;
	/** Notify Svelte views that timer entries changed (start/stop/adjust). */
	bumpTimerRevision(): void;
}
