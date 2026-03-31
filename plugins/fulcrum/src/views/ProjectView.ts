import {ItemView, WorkspaceLeaf, type ViewStateResult} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_PROJECT} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import ProjectSummary from "../svelte/ProjectSummary.svelte";

export class ProjectView extends ItemView {
	private readonly host: FulcrumHost;
	private component: SvelteComponent | null = null;
	projectPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, host: FulcrumHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_PROJECT;
	}

	getDisplayText(): string {
		if (!this.projectPath) return "Project";
		const p = this.host.vaultIndex.resolveProjectByPath(this.projectPath);
		return p?.name ?? "Project";
	}

	getIcon(): string {
		return "folder-kanban";
	}

	getState(): Record<string, unknown> {
		return this.projectPath ? {path: this.projectPath} : {};
	}

	async setState(state: {path?: string}, _result: ViewStateResult): Promise<void> {
		if (state?.path != null) {
			this.projectPath = state.path;
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

		if (!this.projectPath) {
			this.contentEl.createDiv({text: "No project selected. Run “Fulcrum: Open project summary” and pick a project."});
			return;
		}

		this.component = new ProjectSummary({
			target: this.contentEl,
			props: {
				plugin: this.host,
				projectPath: this.projectPath,
				hoverParentLeaf: this.leaf,
				onBackFromProject: () => {
					void this.host.openDashboard();
				},
				backTargetLabel: "Dashboard",
			},
		});
	}
}
