import type {App, WorkspaceLeaf} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {VaultIndex} from "./VaultIndex";
import type {IndexedTask} from "./types";
import type {ProjectLogActivityEntry} from "./projectNote";

/** Narrow surface passed into Svelte views (avoids circular imports). */
export interface FulcrumHost {
	readonly app: App;
	readonly settings: FulcrumSettings;
	readonly vaultIndex: VaultIndex;
	openProjectSummary(path: string): Promise<void>;
	openDashboard(): Promise<void>;
	openTimeTracked(): Promise<void>;
	refreshIndex(): Promise<void>;
	appendProjectLogEntry(projectPath: string, text: string): Promise<void>;
	/** Opens modal: optional review note, updates review dates, appends Fulcrum log line. */
	openMarkReviewedModal(
		projectPath: string,
		onComplete?: () => void | Promise<void>,
	): void;
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
	/** TaskNotes “Create new task” with project pre-filled when the plugin exposes it. */
	openTaskNoteCreateForProject(projectPath: string): void;
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
	toggleIndexedTask(task: IndexedTask): Promise<void>;
	patchSettings(partial: Partial<FulcrumSettings>): Promise<void>;
	triggerFulcrumHoverLink(
		event: MouseEvent,
		hoverParent: WorkspaceLeaf,
		targetEl: HTMLElement,
		path: string,
	): void;
	/** Renders markdown into a host element (e.g. activity note preview). */
	renderActivityBodyPreview(el: HTMLElement, sourcePath: string, markdown: string): Promise<void>;
}
