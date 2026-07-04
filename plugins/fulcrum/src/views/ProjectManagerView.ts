import {ItemView, WorkspaceLeaf, type ViewStateResult} from "obsidian";
import type {SvelteComponent} from "svelte";
import {FULCRUM_PLUGIN_ICON, VIEW_PROJECT_MANAGER} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import ProjectManager from "../svelte/ProjectManager.svelte";

export type ProjectManagerViewState = {
	mode?: "dashboard" | "review" | "tasks" | "project" | "kanban" | "calendar" | "time" | "orbit";
	projectPath?: string;
	personPath?: string;
	timeTab?: import("../timer/types").TimeModeTab;
};

export type ProjectManagerShellMode =
	| "dashboard"
	| "review"
	| "tasks"
	| "kanban"
	| "calendar"
	| "time"
	| "orbit";

export function projectManagerShellLabel(mode: ProjectManagerShellMode): string {
	const names: Record<ProjectManagerShellMode, string> = {
		dashboard: "Dashboard",
		review: "Review",
		tasks: "Horizon",
		kanban: "Kanban",
		calendar: "Calendar",
		time: "Time",
		orbit: "Orbit",
	};
	return names[mode];
}

export class ProjectManagerView extends ItemView {
	private readonly host: FulcrumHost;
	private component: SvelteComponent | null = null;
	private lastMainMode: ProjectManagerView["mainMode"] | "" = "";
	private lastProjectPath: string | null = null;
	private lastPersonPath: string | null = null;
	mainMode: "dashboard" | "review" | "tasks" | "project" | "kanban" | "calendar" | "time" | "orbit" =
		"dashboard";
	projectPath: string | null = null;
	personPath: string | null = null;
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
		if (this.mainMode === "orbit" && this.personPath) {
			const f = this.app.vault.getAbstractFileByPath(this.personPath);
			if (f?.name) return f.name.replace(/\.md$/i, "");
		}
		if (this.mainMode === "review") return "Review";
		if (this.mainMode === "tasks") return "Horizon";
		if (this.mainMode === "kanban") return "Kanban";
		if (this.mainMode === "calendar") return "Calendar";
		if (this.mainMode === "time") return "Time";
		if (this.mainMode === "orbit") return "Orbit";
		return "Fulcrum Project Manager";
	}

	getIcon(): string {
		return FULCRUM_PLUGIN_ICON;
	}

	getState(): ProjectManagerViewState {
		if (this.mainMode === "project" && this.projectPath) {
			return {mode: "project", projectPath: this.projectPath};
		}
		if (this.mainMode === "orbit") {
			return this.personPath ? {mode: "orbit", personPath: this.personPath} : {mode: "orbit"};
		}
		if (this.mainMode === "review") return {mode: "review"};
		if (this.mainMode === "tasks") return {mode: "tasks"};
		if (this.mainMode === "kanban") return {mode: "kanban"};
		if (this.mainMode === "calendar") return {mode: "calendar"};
		if (this.mainMode === "time") return {mode: "time"};
		return {mode: "dashboard"};
	}

	async setState(state: ProjectManagerViewState, _result: ViewStateResult): Promise<void> {
		if (state?.mode === "project" && typeof state.projectPath === "string" && state.projectPath) {
			this.mainMode = "project";
			this.projectPath = state.projectPath;
			this.personPath = null;
		} else if (state?.mode === "orbit") {
			this.mainMode = "orbit";
			this.projectPath = null;
			this.personPath =
				typeof state.personPath === "string" && state.personPath ? state.personPath : null;
			this.shellReturnTarget = "orbit";
		} else if (state?.mode === "review") {
			this.mainMode = "review";
			this.projectPath = null;
			this.personPath = null;
			this.shellReturnTarget = "review";
		} else if (state?.mode === "tasks") {
			this.mainMode = "tasks";
			this.projectPath = null;
			this.personPath = null;
			this.shellReturnTarget = "tasks";
		} else if (state?.mode === "kanban") {
			this.mainMode = "kanban";
			this.projectPath = null;
			this.personPath = null;
			this.shellReturnTarget = "kanban";
		} else if (state?.mode === "calendar") {
			this.mainMode = "calendar";
			this.projectPath = null;
			this.personPath = null;
			this.shellReturnTarget = "calendar";
		} else if (state?.mode === "time") {
			this.mainMode = "time";
			this.projectPath = null;
			this.personPath = null;
			this.shellReturnTarget = "time";
		} else {
			this.mainMode = "dashboard";
			this.projectPath = null;
			this.personPath = null;
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

	private projectManagerProps(): NonNullable<
		ConstructorParameters<typeof ProjectManager>[0]["props"]
	> {
		return {
			plugin: this.host,
			orbitHost: this.host.orbitHost,
			hoverParentLeaf: this.leaf,
			mainMode: this.mainMode,
			projectPath: this.projectPath,
			personPath: this.personPath,
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
			onSelectTasks: () => {
				void this.leaf.setViewState({
					type: VIEW_PROJECT_MANAGER,
					active: true,
					state: {mode: "tasks"},
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
			onSelectOrbit: () => {
				void this.leaf.setViewState({
					type: VIEW_PROJECT_MANAGER,
					active: true,
					state: {mode: "orbit", personPath: this.personPath ?? undefined},
				});
			},
			onSelectPerson: (path: string) => {
				void this.leaf.setViewState({
					type: VIEW_PROJECT_MANAGER,
					active: true,
					state: {mode: "orbit", personPath: path},
				});
			},
		};
	}

	private async render(): Promise<void> {
		const props = this.projectManagerProps();
		const nonProjectShellModes = new Set<ProjectManagerView["mainMode"]>([
			"dashboard",
			"review",
			"tasks",
			"kanban",
			"calendar",
			"time",
		]);
		const patchShell =
			this.component != null &&
			nonProjectShellModes.has(this.mainMode) &&
			this.lastMainMode !== "" &&
			nonProjectShellModes.has(this.lastMainMode) &&
			this.mainMode !== this.lastMainMode;
		const patchProject =
			this.component != null &&
			this.mainMode === "project" &&
			this.lastMainMode === "project" &&
			this.projectPath === this.lastProjectPath;
		const patchOrbit =
			this.component != null &&
			this.mainMode === "orbit" &&
			this.lastMainMode === "orbit" &&
			this.personPath === this.lastPersonPath;

		if (patchShell || patchProject || patchOrbit) {
			this.component!.$set(props);
		} else {
			this.component?.$destroy();
			this.component = null;
			this.contentEl.empty();
			this.component = new ProjectManager({
				target: this.contentEl,
				props,
			});
		}

		this.lastMainMode = this.mainMode;
		this.lastProjectPath = this.projectPath;
		this.lastPersonPath = this.personPath;
	}
}
