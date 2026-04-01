import {MarkdownView, Plugin, TFile, type WorkspaceLeaf} from "obsidian";
import {revealOrCreateView} from "@obsidian-suite/core";
import {createSuiteShellViewClass} from "@obsidian-suite/svelte-shell";
import App from "./App.svelte";
import {OrbitSettingTab} from "./OrbitSettingTab";
import {VIEW_ORBIT_MAIN, VIEW_ORBIT_PERSON} from "./orbit/constants";
import type {OrbitHost} from "./orbit/pluginHost";
import {isFileInPeopleDirs} from "./orbit/pathUtils";
import {formatQuickNoteLine} from "./orbit/quickNoteFormat";
import {DEFAULT_SETTINGS, normalizeSettings, type OrbitSettings} from "./orbit/settings";
import {PersonView} from "./views/PersonView";

const ShellView = createSuiteShellViewClass({
	viewType: VIEW_ORBIT_MAIN,
	displayText: "Orbit",
	icon: "orbit",
	App,
});

export default class OrbitPlugin extends Plugin implements OrbitHost {
	settings: OrbitSettings = DEFAULT_SETTINGS;

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async openMarkdownFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf("tab").openFile(file);
	}

	async appendQuickNote(personFile: TFile, text: string): Promise<void> {
		const line = formatQuickNoteLine(text.trim());
		await this.app.vault.append(personFile, `\n${line}\n`);
	}

	/** Fulcrum / suite: open a person in the Orbit profile (split leaf). */
	async openPersonFile(file: TFile): Promise<void> {
		if (file.extension !== "md") {
			await this.app.workspace.getLeaf("tab").openFile(file);
			return;
		}
		if (!isFileInPeopleDirs(file.path, this.settings.peopleDirs)) {
			await this.app.workspace.getLeaf("tab").openFile(file);
			return;
		}
		const leaf = this.app.workspace.getLeaf("split", "vertical");
		await leaf.setViewState({
			type: VIEW_ORBIT_PERSON,
			active: true,
			state: {path: file.path},
		});
		await this.app.workspace.revealLeaf(leaf);
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_ORBIT_MAIN, (leaf) => new ShellView(leaf, this));
		this.registerView(VIEW_ORBIT_PERSON, (leaf) => new PersonView(leaf, this));

		this.addSettingTab(new OrbitSettingTab(this.app, this));

		/* `file-open` often fires before the target leaf is a MarkdownView — defer and scan leaves. */
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				if (!isFileInPeopleDirs(file.path, this.settings.peopleDirs)) return;
				this.scheduleRoutePersonFile(file);
			}),
		);
		/* Opening from some panes / quick switcher: ensure we catch the leaf once it’s markdown. */
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				this.maybeRouteLeafForPerson(leaf);
			}),
		);

		this.addRibbonIcon("orbit", "Orbit", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open Orbit",
			callback: () => void this.activateMainView(),
		});
	}

	private async loadSettings(): Promise<void> {
		const raw = await this.loadData();
		this.settings = normalizeSettings(raw as Partial<OrbitSettings>);
	}

	/** Run after layout catches up: `file-open` is too early for `getActiveViewOfType(MarkdownView)`. */
	private scheduleRoutePersonFile(file: TFile): void {
		const run = (): void => {
			const leaf = this.findMarkdownLeafForFile(file);
			if (leaf) void this.routeMarkdownLeafToOrbit(leaf, file);
		};
		queueMicrotask(run);
		window.setTimeout(run, 0);
	}

	private findMarkdownLeafForFile(file: TFile): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const v = leaf.view;
			if (v instanceof MarkdownView && v.file?.path === file.path) found = leaf;
		});
		return found;
	}

	private maybeRouteLeafForPerson(leaf: WorkspaceLeaf | null): void {
		if (!leaf) return;
		const v = leaf.view;
		if (!(v instanceof MarkdownView) || !v.file) return;
		if (!(v.file instanceof TFile) || v.file.extension !== "md") return;
		if (!isFileInPeopleDirs(v.file.path, this.settings.peopleDirs)) return;
		void this.routeMarkdownLeafToOrbit(leaf, v.file);
	}

	private async routeMarkdownLeafToOrbit(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
		const vs = leaf.getViewState();
		if (vs.type === VIEW_ORBIT_PERSON && (vs.state as {path?: string} | undefined)?.path === file.path) {
			return;
		}
		await leaf.setViewState({
			type: VIEW_ORBIT_PERSON,
			active: true,
			state: {path: file.path},
		});
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_ORBIT_MAIN, "sidebar");
	}
}
