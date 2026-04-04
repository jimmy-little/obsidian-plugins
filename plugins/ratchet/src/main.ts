import { Notice, Plugin, type ObsidianProtocolData } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { DataManager } from "./data/DataManager";
import { DEFAULT_SETTINGS, type RatchetSettings } from "./settings/Settings";
import { RatchetSettingTab } from "./settings/RatchetSettingTab";
import { RatchetMainView, VIEW_TYPE_RATCHET_MAIN } from "./ui/RatchetMainView";
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

	/** Which tracker is selected for editing in the main view: null, "new", or tracker id. */
	ratchetViewState: { selectedId: string | null } = { selectedId: null };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.refreshDataManager();

		this.registerView(VIEW_TYPE_RATCHET_MAIN, (leaf) => new RatchetMainView(leaf, this));

		this.addRibbonIcon("tally-5", "Ratchet", () => {
			void this.activateRatchetView();
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
				this.ratchetViewState.selectedId = "new";
				void this.activateRatchetView();
			},
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
		if (screen && screen !== "main") {
			new Notice(`Ratchet: unknown screen "${screen}".`);
			return;
		}
		await this.activateRatchetView();
	}

	async activateRatchetView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE_RATCHET_MAIN, "sidebar");
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
