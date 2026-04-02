import {ItemView, WorkspaceLeaf, type ViewStateResult} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_ORBIT_MAIN} from "../orbit/constants";
import type {OrbitHost} from "../orbit/pluginHost";
import {leafIsInSideDock} from "../orbit/workspaceLeaf";
import OrbitHome from "../svelte/OrbitHome.svelte";

export type OrbitMainViewState = {
	selectedPersonPath?: string;
};

export class OrbitMainView extends ItemView {
	private readonly host: OrbitHost;
	private component: SvelteComponent | null = null;
	selectedPersonPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, host: OrbitHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_ORBIT_MAIN;
	}

	getIcon(): string {
		return "orbit";
	}

	getDisplayText(): string {
		if (this.selectedPersonPath && !leafIsInSideDock(this.app, this.leaf)) {
			const f = this.app.vault.getAbstractFileByPath(this.selectedPersonPath);
			if (f?.name) return f.name.replace(/\.md$/i, "");
		}
		return "Orbit";
	}

	getState(): OrbitMainViewState {
		return this.selectedPersonPath ? {selectedPersonPath: this.selectedPersonPath} : {};
	}

	async setState(state: OrbitMainViewState, _result: ViewStateResult): Promise<void> {
		if (typeof state?.selectedPersonPath === "string" && state.selectedPersonPath) {
			this.selectedPersonPath = state.selectedPersonPath;
		} else {
			this.selectedPersonPath = null;
		}
		await this.render();
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.component?.$set({fullView: !leafIsInSideDock(this.app, this.leaf)});
			}),
		);
		await this.render();
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}

	private isFullView(): boolean {
		return !leafIsInSideDock(this.app, this.leaf);
	}

	private async render(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();

		this.component = new OrbitHome({
			target: this.contentEl,
			props: {
				plugin: this.host,
				fullView: this.isFullView(),
				selectedPersonPath: this.selectedPersonPath,
				onSelectPersonPath: (path: string) => {
					void this.onPersonSelected(path);
				},
			},
		});
	}

	private async onPersonSelected(path: string): Promise<void> {
		this.selectedPersonPath = path;
		if (leafIsInSideDock(this.app, this.leaf)) {
			await this.host.openPersonProfileInMain(path);
			this.component?.$set({selectedPersonPath: path});
		} else {
			await this.leaf.setViewState({
				type: VIEW_ORBIT_MAIN,
				active: true,
				state: {selectedPersonPath: path},
			});
		}
	}
}
