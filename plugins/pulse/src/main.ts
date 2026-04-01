import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, PulseSettingTab } from "./settings";
import type { PulseSettings } from "./settings";
import { ImportManager } from "./import/importManager";
import { WorkoutDataManager } from "./workout/WorkoutDataManager";
import { PulseView, VIEW_TYPE_PULSE } from "./views/PulseView";
import { renderExerciseLogBlock, renderSessionBlock } from "./workout/renderers";

export default class PulsePlugin extends Plugin {
	settings!: PulseSettings;
	importManager!: ImportManager;
	workoutDataManager!: WorkoutDataManager;
	private ribbonEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.importManager = new ImportManager(this.app.vault, this.app, this.settings);
		this.workoutDataManager = new WorkoutDataManager(this.app.vault, this.settings);

		// Register leaf view
		this.registerView(VIEW_TYPE_PULSE, (leaf) => new PulseView(leaf, this));

		// Ribbon icon — opens the full-leaf view
		if (this.settings.showRibbonIcon) {
			this.ribbonEl = this.addRibbonIcon("dumbbell", "Pulse", () => {
				this.openPulseView();
			});
		}

		// Command palette
		this.addCommand({
			id: "open-pulse",
			name: "Open Pulse",
			callback: () => this.openPulseView(),
		});

		this.addCommand({
			id: "open-pulse-today",
			name: "Open Pulse — Today",
			callback: () => this.openPulseView("today"),
		});

		this.addCommand({
			id: "open-pulse-stats",
			name: "Open Pulse — Stats",
			callback: () => this.openPulseView("stats"),
		});

		this.addCommand({
			id: "open-pulse-history",
			name: "Open Pulse — History",
			callback: () => this.openPulseView("history"),
		});

		this.addCommand({
			id: "scan-health-workout-imports",
			name: "Scan for Health and Workout Imports",
			callback: () => this.importManager.scanAndImport(),
		});

		this.addCommand({
			id: "update-banner-this-page",
			name: "Update banner for this page",
			callback: () => this.importManager.updateBannerForActiveNote(),
		});

		// Code block renderers
		this.registerMarkdownCodeBlockProcessor("pulse-log", (source, el) => {
			renderExerciseLogBlock(source, el, this);
		});

		this.registerMarkdownCodeBlockProcessor("pulse-session", (source, el) => {
			renderSessionBlock(source, el, this);
		});

		// Settings tab
		this.addSettingTab(new PulseSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_PULSE);
	}

	async openPulseView(mode?: string, path?: string): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PULSE)[0];
		if (existing) {
			await existing.setViewState({
				type: VIEW_TYPE_PULSE,
				active: true,
				state: { mode: mode ?? "today", path },
			});
			this.app.workspace.revealLeaf(existing);
			return;
		}

		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_PULSE,
			active: true,
			state: { mode: mode ?? "today", path },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
