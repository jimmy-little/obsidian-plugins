import { Notice, Plugin, normalizePath, type ObsidianProtocolData } from "obsidian";
import { DEFAULT_SETTINGS, PulseSettingTab } from "./settings";
import type { PulseSettings } from "./settings";
import { ImportManager } from "./import/importManager";
import { WorkoutDataManager } from "./workout/WorkoutDataManager";
import { PulseView, VIEW_TYPE_PULSE, type PulseViewMode } from "./views/PulseView";
import { renderExerciseLogBlock, renderSessionBlock } from "./workout/renderers";

export default class PulsePlugin extends Plugin {
	settings!: PulseSettings;
	importManager!: ImportManager;
	workoutDataManager!: WorkoutDataManager;
	private ribbonEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.workoutDataManager = new WorkoutDataManager(this.app.vault, this.settings);
		this.importManager = new ImportManager(
			this.app.vault,
			this.app,
			this.settings,
			() => this.saveSettings(),
			this.workoutDataManager
		);

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
			id: "open-pulse-body",
			name: "Open Pulse — Body",
			callback: () => this.openPulseView("body"),
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

		this.registerMarkdownCodeBlockProcessor("pulse-session", (source, el, ctx) => {
			renderSessionBlock(source, el, this, ctx.sourcePath);
		});

		// Settings tab
		this.addSettingTab(new PulseSettingTab(this.app, this));

		this.registerObsidianProtocolHandler(this.manifest.id, (params) => {
			this.handlePulseOpenUri(params);
		});
	}

	private readonly pulseModeAliases: Record<string, PulseViewMode> = {
		programs: "program",
		programmes: "program",
		exercises: "exercise",
	};

	private handlePulseOpenUri(params: ObsidianProtocolData): void {
		void this.applyPulseDeepLink(params).catch((err) => {
			console.error(err);
			new Notice("Pulse could not open that link.");
		});
	}

	private async applyPulseDeepLink(params: ObsidianProtocolData): Promise<void> {
		const raw = String(params.screen ?? params.mode ?? params.leaf ?? "today")
			.trim()
			.toLowerCase();
		const route = String(params.route ?? "")
			.trim()
			.replace(/^\/+/, "");
		let modeKey = raw;
		if (!modeKey && route) {
			const tail = route.replace(/^pulse\//i, "");
			modeKey = (tail.split("/")[0] ?? "").toLowerCase();
		}
		if (!modeKey) modeKey = "today";

		const mode: PulseViewMode =
			this.pulseModeAliases[modeKey] ?? (modeKey as PulseViewMode);
		const valid: PulseViewMode[] = [
			"today",
			"exercise",
			"session",
			"program",
			"history",
			"stats",
			"body",
			"new-exercise",
			"workout-builder",
			"program-builder",
			"edit-program",
			"workout-edit",
		];
		if (!valid.includes(mode)) {
			new Notice(`Pulse: unknown screen "${modeKey}".`);
			return;
		}

		const pathRaw = String(params.path ?? "").trim();
		await this.openPulseView(mode, pathRaw ? normalizePath(pathRaw) : undefined);
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
