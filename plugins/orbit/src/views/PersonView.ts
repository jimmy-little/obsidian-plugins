import {ItemView, WorkspaceLeaf, normalizePath, type ViewStateResult} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_ORBIT_PERSON} from "../orbit/constants";
import type {OrbitHost} from "../orbit/pluginHost";
import PersonProfile from "../svelte/PersonProfile.svelte";

export type PersonViewState = {
	path?: string;
};

export class PersonView extends ItemView {
	private readonly plugin: OrbitHost;
	private component: SvelteComponent | null = null;
	personPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: OrbitHost) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_ORBIT_PERSON;
	}

	getDisplayText(): string {
		if (!this.personPath) return "Person";
		const f = this.app.vault.getAbstractFileByPath(normalizePath(this.personPath));
		if (f?.name) return f.name.replace(/\.md$/i, "");
		return "Person";
	}

	getIcon(): string {
		return "user";
	}

	getState(): PersonViewState {
		return this.personPath ? {path: this.personPath} : {};
	}

	async setState(state: PersonViewState, _result: ViewStateResult): Promise<void> {
		if (typeof state?.path === "string" && state.path) {
			this.personPath = normalizePath(state.path);
		} else {
			this.personPath = null;
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
		if (!this.personPath) {
			this.component?.$destroy();
			this.component = null;
			this.contentEl.empty();
			this.contentEl.createDiv({text: "No person file is open.", cls: "orbit-muted"});
			return;
		}

		if (this.component) {
			this.component.$set({
				plugin: this.plugin,
				filePath: this.personPath,
			});
			return;
		}

		this.contentEl.empty();
		this.component = new PersonProfile({
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				filePath: this.personPath,
			},
		});
	}
}
