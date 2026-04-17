import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type { SvelteComponent } from "svelte";
import type ReposePlugin from "./main";
import { leafIsInSideDock } from "./workspaceLeaf";
import ReposeHome from "./svelte/ReposeHome.svelte";

export const VIEW_TYPE_REPOSE = "repose-main-view";

export type ReposeViewState = {
	selectedPath?: string;
	/** Main pane shows the Repose landing placeholder (design TBD). */
	landing?: boolean;
};

export class ReposeShellView extends ItemView {
	private component: SvelteComponent | null = null;
	private selectedPath: string | null = null;
	private showLanding = false;

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
		const s: ReposeViewState = {};
		if (this.selectedPath) s.selectedPath = this.selectedPath;
		if (this.showLanding) s.landing = true;
		return s;
	}

	async setState(state: ReposeViewState, _result: ViewStateResult): Promise<void> {
		const s = state ?? {};
		const path = s.selectedPath;
		const hasPath = typeof path === "string" && path.length > 0;

		if (hasPath) {
			this.selectedPath = path;
			this.showLanding = false;
		} else if (s.landing === true) {
			this.showLanding = true;
			this.selectedPath = null;
		} else {
			this.selectedPath = null;
			this.showLanding = false;
		}
		// Avoid tearing down Svelte on every selection — preserves sidebar scroll, search, filters.
		if (this.component) {
			this.component.$set({
				selectedPath: this.selectedPath,
				landing: this.showLanding,
			});
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
				landing: this.showLanding,
				onSelectPath: (path: string) => void this.onSelected(path),
				onGoHome: () => void this.goHome(),
			},
		});
	}

	private async goHome(): Promise<void> {
		this.showLanding = true;
		this.selectedPath = null;
		this.component?.$set({ selectedPath: null, landing: true });

		if (leafIsInSideDock(this.app, this.leaf)) {
			const mainLeaf = this.app.workspace.getLeaf("tab");
			await mainLeaf.setViewState({
				type: VIEW_TYPE_REPOSE,
				active: true,
				state: { landing: true },
			});
			await this.app.workspace.revealLeaf(mainLeaf);
			return;
		}

		await this.leaf.setViewState({
			type: VIEW_TYPE_REPOSE,
			active: true,
			state: { landing: true },
		});
	}

	private async onSelected(path: string): Promise<void> {
		this.showLanding = false;
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
			this.component?.$set({ selectedPath: path, landing: false });
			return;
		}

		await this.leaf.setViewState({
			type: VIEW_TYPE_REPOSE,
			active: true,
			state: { selectedPath: path },
		});
		this.component?.$set({ landing: false });
	}
}
