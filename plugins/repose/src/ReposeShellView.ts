import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type { SvelteComponent } from "svelte";
import type ReposePlugin from "./main";
import { leafIsInSideDock } from "./workspaceLeaf";
import ReposeHome from "./svelte/ReposeHome.svelte";

export const VIEW_TYPE_REPOSE = "repose-main-view";

export type ReposeViewState = {
	selectedPath?: string;
};

export class ReposeShellView extends ItemView {
	private component: SvelteComponent | null = null;
	private selectedPath: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReposePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_REPOSE;
	}

	getDisplayText(): string {
		return "Repose";
	}

	getIcon(): string {
		return "clapperboard";
	}

	getState(): ReposeViewState {
		return this.selectedPath ? { selectedPath: this.selectedPath } : {};
	}

	async setState(state: ReposeViewState, _result: ViewStateResult): Promise<void> {
		if (typeof state?.selectedPath === "string" && state.selectedPath) {
			this.selectedPath = state.selectedPath;
		} else {
			this.selectedPath = null;
		}
		// Avoid tearing down Svelte on every selection — preserves sidebar scroll, search, filters.
		if (this.component) {
			this.component.$set({ selectedPath: this.selectedPath });
		} else {
			await this.render();
		}
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.component?.$set({ fullView: !leafIsInSideDock(this.app, this.leaf) });
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

		this.component = new ReposeHome({
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				fullView: this.isFullView(),
				selectedPath: this.selectedPath,
				onSelectPath: (path: string) => void this.onSelected(path),
			},
		});
	}

	private async onSelected(path: string): Promise<void> {
		this.selectedPath = path;

		if (leafIsInSideDock(this.app, this.leaf)) {
			// Open/reuse the main-pane Repose view (never mutate the dock leaf).
			const mainLeaf = this.app.workspace.getLeaf("tab");
			await mainLeaf.setViewState({
				type: VIEW_TYPE_REPOSE,
				active: true,
				state: { selectedPath: path },
			});
			await this.app.workspace.revealLeaf(mainLeaf);
			this.component?.$set({ selectedPath: path });
			return;
		}

		await this.leaf.setViewState({
			type: VIEW_TYPE_REPOSE,
			active: true,
			state: { selectedPath: path },
		});
	}
}
