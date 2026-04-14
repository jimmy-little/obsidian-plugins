import {ItemView, WorkspaceLeaf, type ViewStateResult} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_PROJECT_MANAGER} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import ProjectManager from "../svelte/ProjectManager.svelte";

export type ProjectManagerViewState = {
	mode?: "dashboard" | "review" | "areas" | "project" | "kanban" | "calendar" | "time";
	projectPath?: string;
};

export type ProjectManagerShellMode =
	| "dashboard"
	| "review"
	| "areas"
	| "kanban"
	| "calendar"
	| "time";

export function projectManagerShellLabel(mode: ProjectManagerShellMode): string {
	const names: Record<ProjectManagerShellMode, string> = {
		dashboard: "Dashboard",
		review: "Review",
		areas: "Areas",
		kanban: "Kanban",
		calendar: "Calendar",
		time: "Time tracked",
	};
	return names[mode];
}

export class ProjectManagerView extends ItemView {
	private readonly host: FulcrumHost;
	private component: SvelteComponent | null = null;
	mainMode: "dashboard" | "review" | "areas" | "project" | "kanban" | "calendar" | "time" =
		"dashboard";
	projectPath: string | null = null;
	/** Last non-project mode; used when leaving a project view (glyph bar or back). */
	shellReturnTarget: ProjectManagerShellMode = "dashboard";

	constructor(leaf: WorkspaceLeaf, host: FulcrumHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_PROJECT_MANAGER;
	}

	getDisplayText(): string {
		if (this.mainMode === "project" && this.projectPath) {
			const p = this.host.vaultIndex.resolveProjectByPath(this.projectPath);
			return p?.name ?? "Project";
		}
		if (this.mainMode === "review") return "Review";
		if (this.mainMode === "areas") return "Areas";
		if (this.mainMode === "kanban") return "Kanban";
		if (this.mainMode === "calendar") return "Calendar";
		if (this.mainMode === "time") return "Time tracked";
		return "Fulcrum Project Manager";
	}

	getIcon(): string {
		return "layout-dashboard";
	}

	getState(): ProjectManagerViewState {
		if (this.mainMode === "project" && this.projectPath) {
			return {mode: "project", projectPath: this.projectPath};
		}
		if (this.mainMode === "review") return {mode: "review"};
		if (this.mainMode === "areas") return {mode: "areas"};
		if (this.mainMode === "kanban") return {mode: "kanban"};
		if (this.mainMode === "calendar") return {mode: "calendar"};
		if (this.mainMode === "time") return {mode: "time"};
		return {mode: "dashboard"};
	}

	async setState(state: ProjectManagerViewState, _result: ViewStateResult): Promise<void> {
		if (state?.mode === "project" && typeof state.projectPath === "string" && state.projectPath) {
			this.mainMode = "project";
			this.projectPath = state.projectPath;
		} else if (state?.mode === "review") {
			this.mainMode = "review";
			this.projectPath = null;
			this.shellReturnTarget = "review";
		} else if (state?.mode === "areas") {
			this.mainMode = "areas";
			this.projectPath = null;
			this.shellReturnTarget = "areas";
		} else if (state?.mode === "kanban") {
			this.mainMode = "kanban";
			this.projectPath = null;
			this.shellReturnTarget = "kanban";
		} else if (state?.mode === "calendar") {
			this.mainMode = "calendar";
			this.projectPath = null;
			this.shellReturnTarget = "calendar";
		} else if (state?.mode === "time") {
			this.mainMode = "time";
			this.projectPath = null;
			this.shellReturnTarget = "time";
		} else {
			this.mainMode = "dashboard";
			this.projectPath = null;
			this.shellReturnTarget = "dashboard";
		}
		await this.render();
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}

	private async render(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();

		this.component = new ProjectManager({
			target: this.contentEl,
			props: {
				plugin: this.host,
				hoverParentLeaf: this.leaf,
				mainMode: this.mainMode,
				projectPath: this.projectPath,
				projectBackTargetLabel:
					this.mainMode === "project" ? projectManagerShellLabel(this.shellReturnTarget) : "",
				onBackFromProject:
					this.mainMode === "project"
						? () => {
								void this.leaf.setViewState({
									type: VIEW_PROJECT_MANAGER,
									active: true,
									state: {mode: this.shellReturnTarget},
								});
							}
						: undefined,
				onSelectDashboard: () => {
					void this.leaf.setViewState({
						type: VIEW_PROJECT_MANAGER,
						active: true,
						state: {mode: "dashboard"},
					});
				},
				onSelectWeeklyReview: () => {
					void this.leaf.setViewState({
						type: VIEW_PROJECT_MANAGER,
						active: true,
						state: {mode: "review"},
					});
				},
				onSelectAreas: () => {
					void this.leaf.setViewState({
						type: VIEW_PROJECT_MANAGER,
						active: true,
						state: {mode: "areas"},
					});
				},
				onSelectProject: (path: string) => {
					void this.leaf.setViewState({
						type: VIEW_PROJECT_MANAGER,
						active: true,
						state: {mode: "project", projectPath: path},
					});
				},
				onSelectKanban: () => {
					void this.leaf.setViewState({
						type: VIEW_PROJECT_MANAGER,
						active: true,
						state: {mode: "kanban"},
					});
				},
				onSelectCalendar: () => {
					void this.leaf.setViewState({
						type: VIEW_PROJECT_MANAGER,
						active: true,
						state: {mode: "calendar"},
					});
				},
				onSelectTime: () => {
					void this.leaf.setViewState({
						type: VIEW_PROJECT_MANAGER,
						active: true,
						state: {mode: "time"},
					});
				},
			},
		});
	}
}
