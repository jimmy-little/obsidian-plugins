import { Notice, Plugin, type ObsidianProtocolData } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { DataManager } from "./data/DataManager";
import { DEFAULT_SETTINGS, type RatchetSettings } from "./settings/Settings";
import { RatchetSettingTab } from "./settings/RatchetSettingTab";
import { RatchetMainView, VIEW_TYPE_RATCHET_MAIN } from "./ui/RatchetMainView";
import { RatchetQuickLogView, VIEW_TYPE_RATCHET_QUICK_LOG } from "./ui/RatchetQuickLogView";
import { loadStoredQuickLogScope, type QuickLogScope } from "./ui/quickLogScope";
import {
	registerRatchetCounter,
	renderRatchetCounter,
	registerRatchetHeatmap,
	renderRatchetHeatmap,
	registerRatchetSummary,
	renderRatchetSummary,
} from "./processors/CodeBlockProcessor";

export default class RatchetPlugin extends Plugin {
	settings!: RatchetSettings;
	private dataManager: DataManager | null = null;

	/**
	 * Main Ratchet leaf UI: dashboard (cards + quick log) vs month grid, editor selection,
	 * grid month navigation; quick log scope; dedicated quick-log leaf (main) for mobile shortcuts.
	 */
	ratchetViewState: {
		selectedId: string | null;
		mainPane: "dashboard" | "grid";
		gridYear: number;
		gridMonth: number;
		quickLogScope: QuickLogScope;
	} = {
		selectedId: null,
		mainPane: "dashboard",
		gridYear: new Date().getFullYear(),
		gridMonth: new Date().getMonth(),
		quickLogScope: "day",
	};

	async onload(): Promise<void> {
		await this.loadSettings();
		this.ratchetViewState.quickLogScope = loadStoredQuickLogScope();
		this.refreshDataManager();

		this.registerView(VIEW_TYPE_RATCHET_MAIN, (leaf) => new RatchetMainView(leaf, this));
		this.registerView(VIEW_TYPE_RATCHET_QUICK_LOG, (leaf) => new RatchetQuickLogView(leaf, this));

		this.addRibbonIcon("tally-5", "Ratchet", () => {
			void this.activateRatchetView();
		});
		this.addRibbonIcon("layout-grid", "Ratchet month grid", () => {
			void this.openMonthGridInRatchetLeaf();
		});

		this.addCommand({
			id: "open-dashboard",
			name: "Open Ratchet",
			callback: () => void this.activateRatchetView(),
		});

		this.addCommand({
			id: "create-tracker",
			name: "Create new tracker",
			callback: () => {
				this.ratchetViewState.mainPane = "dashboard";
				this.ratchetViewState.selectedId = "new";
				void this.activateRatchetView();
			},
		});

		this.addCommand({
			id: "open-month-grid",
			name: "Open month grid",
			callback: () => void this.openMonthGridInRatchetLeaf(),
		});

		this.addCommand({
			id: "open-quick-log",
			name: "Open Ratchet quick log",
			callback: () => void this.openRatchetQuickLog(),
		});

		this.addSettingTab(new RatchetSettingTab(this.app, this));

		registerRatchetCounter(this, (source, el) => {
			void renderRatchetCounter(source, el, this);
		});
		registerRatchetHeatmap(this, (source, el) => {
			void renderRatchetHeatmap(source, el, this);
		});
		registerRatchetSummary(this, (source, el) => {
			void renderRatchetSummary(source, el, this);
		});

		this.registerObsidianProtocolHandler(this.manifest.id, (params) => {
			void this.applyRatchetDeepLink(params).catch((err) => {
				console.error(err);
				new Notice("Ratchet could not open that link.");
			});
		});
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_RATCHET_MAIN);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_RATCHET_QUICK_LOG);
	}

	private async applyRatchetDeepLink(params: ObsidianProtocolData): Promise<void> {
		const screen = String(params.screen ?? params.leaf ?? "").trim().toLowerCase();
		const route = String(params.route ?? "")
			.trim()
			.replace(/^\/+/, "");
		if (route) {
			const tail = route.replace(/^ratchet\//i, "");
			const seg = (tail.split("/")[0] ?? "").toLowerCase();
			if (seg && seg !== "main") {
				new Notice(`Ratchet: unknown route "${route}".`);
				return;
			}
		}
		const quick =
			String(params.focus ?? "").toLowerCase() === "quicklog" ||
			String(params.panel ?? "").toLowerCase() === "quicklog" ||
			String(params.quicklog ?? "") === "1";

		if (screen === "grid") {
			await this.openMonthGridInRatchetLeaf();
			return;
		}
		if (screen && screen !== "main") {
			new Notice(`Ratchet: unknown screen "${screen}".`);
			return;
		}
		if (quick) {
			await this.openRatchetQuickLog();
			return;
		}
		await this.activateRatchetView();
	}

	/** Re-render all Ratchet custom views (sidebar dashboard + main quick log). */
	refreshRatchetViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RATCHET_MAIN)) {
			if (leaf.view instanceof RatchetMainView) {
				leaf.view.render();
			}
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RATCHET_QUICK_LOG)) {
			if (leaf.view instanceof RatchetQuickLogView) {
				leaf.view.render();
			}
		}
	}

	async activateRatchetView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE_RATCHET_MAIN, "sidebar");
	}

	/** Full dashboard + editor in sidebar (from ribbon / “Open Ratchet”). */
	async openRatchetDashboardForEdit(trackerId: string): Promise<void> {
		this.ratchetViewState.selectedId = trackerId;
		this.ratchetViewState.mainPane = "dashboard";
		await revealOrCreateView(this.app, VIEW_TYPE_RATCHET_MAIN, "sidebar");
		this.refreshRatchetViews();
	}

	async openRatchetNewTracker(): Promise<void> {
		this.ratchetViewState.selectedId = "new";
		this.ratchetViewState.mainPane = "dashboard";
		await revealOrCreateView(this.app, VIEW_TYPE_RATCHET_MAIN, "sidebar");
		this.refreshRatchetViews();
	}

	async openMonthGridInRatchetLeaf(): Promise<void> {
		this.ratchetViewState.mainPane = "grid";
		await revealOrCreateView(this.app, VIEW_TYPE_RATCHET_MAIN, "sidebar");
		this.refreshRatchetViews();
	}

	/** Mobile-friendly tap-to-log in a main tab (home screen shortcuts). */
	async openRatchetQuickLog(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE_RATCHET_QUICK_LOG, "main");
		this.refreshRatchetViews();
	}

	getDataManager(): DataManager {
		if (!this.dataManager) {
			this.refreshDataManager();
		}
		return this.dataManager!;
	}

	refreshDataManager(): void {
		this.dataManager = new DataManager(this.app.vault, this.settings.dataFolder, this.settings.firstDayOfWeek);
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
