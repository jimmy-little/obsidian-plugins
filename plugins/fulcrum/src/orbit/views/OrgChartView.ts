import {ItemView, WorkspaceLeaf, type ViewStateResult} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_ORBIT_ORG_CHART} from "../orbit/constants";
import type {OrbitHost} from "../orbit/pluginHost";
import OrbitOrgChart from "../svelte/OrbitOrgChart.svelte";

export type OrgChartViewState = {
	anchorPath?: string;
};

export class OrgChartView extends ItemView {
	private readonly plugin: OrbitHost;
	private component: SvelteComponent | null = null;
	anchorPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: OrbitHost) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_ORBIT_ORG_CHART;
	}

	getDisplayText(): string {
		if (!this.anchorPath) return "Org chart";
		const f = this.app.vault.getAbstractFileByPath(this.anchorPath);
		if (f?.name) return `Org · ${f.name.replace(/\.md$/i, "")}`;
		return "Org chart";
	}

	getIcon(): string {
		return "git-fork";
	}

	getState(): OrgChartViewState {
		return this.anchorPath ? {anchorPath: this.anchorPath} : {};
	}

	async setState(state: OrgChartViewState, _result: ViewStateResult): Promise<void> {
		if (typeof state?.anchorPath === "string" && state.anchorPath) {
			this.anchorPath = state.anchorPath;
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
		if (!this.anchorPath) {
			this.component?.$destroy();
			this.component = null;
			this.contentEl.empty();
			this.contentEl.createDiv({text: "Open an org chart from a person profile.", cls: "orbit-muted"});
			return;
		}

		if (this.component) {
			this.component.$set({
				plugin: this.plugin,
				anchorPath: this.anchorPath,
			});
			return;
		}

		this.contentEl.empty();
		this.component = new OrbitOrgChart({
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				anchorPath: this.anchorPath,
			},
		});
	}
}
