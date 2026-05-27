import { App, Notice, Plugin, TFile, normalizePath, type ObsidianProtocolData } from "obsidian";
import { WorkoutDocumentView, VIEW_TYPE_PULSE_WORKOUT_DOC } from "./views/WorkoutDocumentView";
import { NutritionDayView, VIEW_TYPE_PULSE_NUTRITION_DAY } from "./views/NutritionDayView";
import { DEFAULT_SETTINGS, PulseSettingTab } from "./settings";
import type { PulseSettings } from "./settings";
import { ImportManager } from "./import/importManager";
import { WorkoutDataManager } from "./workout/WorkoutDataManager";
import { NutritionDataManager } from "./nutrition/NutritionDataManager";
import { PulseView, VIEW_TYPE_PULSE, type PulseViewMode } from "./views/PulseView";
import { renderExerciseLogBlock, renderSessionBlock } from "./workout/renderers";

export default class PulsePlugin extends Plugin {
	settings!: PulseSettings;
	importManager!: ImportManager;
	workoutDataManager!: WorkoutDataManager;
	nutritionDataManager!: NutritionDataManager;
	private ribbonEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.workoutDataManager = new WorkoutDataManager(
			this.app.vault,
			this.settings,
			this.app.metadataCache,
		);
		this.nutritionDataManager = new NutritionDataManager(this.app.vault, this.settings);
		this.importManager = new ImportManager(
			this.app.vault,
			this.app,
			this.settings,
			() => this.saveSettings(),
			this.workoutDataManager,
			() => void this.refreshOpenPulseViews()
		);

		// Register leaf view
		this.registerView(VIEW_TYPE_PULSE, (leaf) => new PulseView(leaf, this));
		this.registerView(VIEW_TYPE_PULSE_WORKOUT_DOC, (leaf) => new WorkoutDocumentView(leaf, this));
		this.registerView(VIEW_TYPE_PULSE_NUTRITION_DAY, (leaf) => new NutritionDayView(leaf, this));

		const invalidateWorkoutList = (): void => {
			this.workoutDataManager.invalidateWorkoutListCache();
		};
		this.registerEvent(this.app.vault.on("create", invalidateWorkoutList));
		this.registerEvent(this.app.vault.on("delete", invalidateWorkoutList));
		this.registerEvent(this.app.vault.on("rename", invalidateWorkoutList));
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				const pathLooksLikeWorkout = /\/Workouts\//i.test(file.path.replace(/\\/g, "/"));
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (!fm) {
					if (pathLooksLikeWorkout) invalidateWorkoutList();
					return;
				}
				if (fm["pulse-type"] === "session" || fm.workoutId || pathLooksLikeWorkout) {
					invalidateWorkoutList();
				}
			}),
		);

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
			id: "open-pulse-home",
			name: "Open Pulse — Home",
			callback: () => this.openPulseView("today"),
		});

		this.addCommand({
			id: "open-pulse-stats",
			name: "Open Pulse — Stats",
			callback: () => this.openPulseView("stats"),
		});

		this.addCommand({
			id: "open-pulse-history",
			name: "Open Pulse — Home",
			callback: () => this.openPulseView("today"),
		});

		this.addCommand({
			id: "open-pulse-body",
			name: "Open Pulse — Body",
			callback: () => this.openPulseView("body"),
		});

		this.addCommand({
			id: "open-pulse-nutrition",
			name: "Open Pulse — Nutrition",
			callback: () => this.openPulseView("nutrition"),
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
		history: "today",
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
			"nutrition",
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
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_PULSE_WORKOUT_DOC);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_PULSE_NUTRITION_DAY);
	}

	/** Standalone workout leaf (banner + actions + sets), Orbit/Fulcrum-style. */
	async openWorkoutDocumentLeaf(notePath: string): Promise<void> {
		const norm = normalizePath(notePath);
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_PULSE_WORKOUT_DOC,
			active: true,
			state: { path: norm },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	/** Daily nutrition breakdown in a split pane. */
	async openNutritionDayView(date: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf("split");
		await leaf.setViewState({
			type: VIEW_TYPE_PULSE_NUTRITION_DAY,
			active: true,
			state: { date },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async refreshOpenPulseViews(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PULSE)) {
			const view = leaf.view;
			if (view instanceof PulseView) {
				await view.refresh();
			}
		}
	}

	async renameWorkout(path: string, newName: string, updateProgramDay: boolean): Promise<void> {
		const trimmed = newName.trim();
		if (!trimmed) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.name = trimmed;
			if (updateProgramDay) {
				fm.programDay = trimmed;
			}
		});
		this.workoutDataManager.invalidateWorkoutListCache();
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

	openSettingsTab(): void {
		const setting = (this.app as App & {
			setting?: { open(): Promise<void>; openTabById(id: string): void };
		}).setting;
		if (!setting) return;
		void setting.open().then(() => setting.openTabById(this.manifest.id));
	}
}
