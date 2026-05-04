import { Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import type { OpenViewsIn } from "@obsidian-suite/core";
import { DEFAULT_SETTINGS, type ChiselSettings } from "./settings";
import { ChiselSettingTab } from "./settings/ChiselSettingTab";
import { ChiselMainView, VIEW_TYPE_CHISEL_MAIN } from "./views/ChiselMainView";
import { CHISEL_DATA_VERSION, type Debt } from "./types";

type PersistedShape = {
	version?: string;
	debts?: unknown[];
	currency?: string;
	openViewsIn?: string;
};

function normalizeDebt(raw: unknown): Debt | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const id = typeof o.id === "string" ? o.id : null;
	const name = typeof o.name === "string" ? o.name.trim() : "";
	const balance = typeof o.balance === "number" ? o.balance : Number.NaN;
	const standardApr = typeof o.standardApr === "number" ? o.standardApr : Number.NaN;
	if (!id || !name || !Number.isFinite(balance) || balance < 0 || !Number.isFinite(standardApr) || standardApr < 0) {
		return null;
	}
	let promo: Debt["promo"] | undefined;
	const pr = o.promo;
	if (pr && typeof pr === "object") {
		const p = pr as Record<string, unknown>;
		const apr = typeof p.apr === "number" ? p.apr : Number.NaN;
		const endsOn = typeof p.endsOn === "string" ? p.endsOn.trim() : "";
		if (Number.isFinite(apr) && apr >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
			promo = { apr, endsOn };
		}
	}
	return { id, name, balance, standardApr, ...(promo ? { promo } : {}) };
}

export default class ChiselPlugin extends Plugin {
	settings: ChiselSettings = { ...DEFAULT_SETTINGS };
	debts: Debt[] = [];
	chiselViewState: { mainMode: "dashboard" | "debt"; selectedDebtId: string | null } = {
		mainMode: "dashboard",
		selectedDebtId: null,
	};
	private payoffDraftByDebt = new Map<string, { primary: string; compare: string }>();
	/** Session-only: last “total budget” typed in the dashboard recommender. */
	recommendationBudgetStr = "";

	async onload(): Promise<void> {
		await this.loadPersisted();

		this.registerView(VIEW_TYPE_CHISEL_MAIN, (leaf) => new ChiselMainView(leaf, this));

		this.addRibbonIcon("landmark", "Chisel", () => {
			void this.activateChiselView();
		});

		this.addCommand({
			id: "open-chisel",
			name: "Open Chisel",
			callback: () => void this.activateChiselView(),
		});

		this.addSettingTab(new ChiselSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHISEL_MAIN);
	}

	getPayoffDraft(debtId: string): { primary: string; compare: string } | undefined {
		return this.payoffDraftByDebt.get(debtId);
	}

	setPayoffDraft(debtId: string, d: { primary: string; compare: string }): void {
		this.payoffDraftByDebt.set(debtId, d);
	}

	deletePayoffDraft(debtId: string): void {
		this.payoffDraftByDebt.delete(debtId);
	}

	private async loadPersisted(): Promise<void> {
		const raw = (await this.loadData()) as PersistedShape | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			currency: typeof raw?.currency === "string" && raw.currency ? raw.currency : DEFAULT_SETTINGS.currency,
			openViewsIn:
				raw?.openViewsIn === "main" || raw?.openViewsIn === "sidebar"
					? raw.openViewsIn
					: DEFAULT_SETTINGS.openViewsIn,
		};

		const list = Array.isArray(raw?.debts) ? raw.debts : [];
		this.debts = list.map(normalizeDebt).filter((d): d is Debt => d != null);
	}

	async persist(): Promise<void> {
		await this.saveData({
			version: CHISEL_DATA_VERSION,
			debts: this.debts,
			currency: this.settings.currency,
			openViewsIn: this.settings.openViewsIn,
		});
	}

	refreshChiselViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHISEL_MAIN)) {
			if (leaf.view instanceof ChiselMainView) {
				leaf.view.render();
			}
		}
	}

	async activateChiselView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE_CHISEL_MAIN, this.settings.openViewsIn as OpenViewsIn);
	}
}
