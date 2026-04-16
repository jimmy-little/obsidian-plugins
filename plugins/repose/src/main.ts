import { Notice, Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { syncImagesForNoteFile } from "./downloadReposeImages";
import { classifyFile } from "./match";
import { normalizeLoadedSettings, type ReposeSettings } from "./settings";
import { ReposeSettingTab } from "./ReposeSettingTab";
import { ReposeView, VIEW_TYPE_REPOSE } from "./ReposeView";

export default class ReposePlugin extends Plugin {
	settings!: ReposeSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_REPOSE, (leaf) => new ReposeView(leaf, this));

		this.addRibbonIcon("clapperboard", "Repose", () => {
			void this.openLibrary();
		});

		this.addCommand({
			id: "open-library",
			name: "Open library",
			callback: () => void this.openLibrary(),
		});

		this.addCommand({
			id: "reset-library-panes",
			name: "Reset Repose library (close all Repose tabs, then open one)",
			callback: () => void this.resetAllReposePanes(),
		});

		this.addCommand({
			id: "sync-tmdb-images",
			name: "Download show/movie images (TMDB)",
			callback: () => {
				const f = this.app.workspace.getActiveFile();
				if (!f || f.extension !== "md") {
					new Notice("Open a markdown note.");
					return;
				}
				const kinds = classifyFile(this.app, f, this.settings);
				void syncImagesForNoteFile(this.app, this.settings, f, kinds);
			},
		});

		this.addSettingTab(new ReposeSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPOSE);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeLoadedSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Recover from workspace glitches that left multiple Repose leaves open (blank panes).
	 * Keeps the first leaf; detaches the rest before revealing.
	 */
	private dedupeReposeLeaves(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPOSE);
		for (let i = 1; i < leaves.length; i++) {
			leaves[i].detach();
		}
	}

	async openLibrary(): Promise<void> {
		this.dedupeReposeLeaves();
		await revealOrCreateView(this.app, VIEW_TYPE_REPOSE, this.settings.openViewsIn);
	}

	/** Hard reset if the workspace accumulated duplicate / blank Repose leaves. */
	async resetAllReposePanes(): Promise<void> {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPOSE);
		await revealOrCreateView(this.app, VIEW_TYPE_REPOSE, this.settings.openViewsIn);
	}
}
