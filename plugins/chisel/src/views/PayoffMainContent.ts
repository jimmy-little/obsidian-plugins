import { Notice, Setting } from "obsidian";
import type ChiselPlugin from "../main";
import { formatApr, formatMoney } from "../format";
import { simulatePayoff } from "../math/payoffSimulation";
import type { Debt } from "../types";
import { renderBalancePayoffChart } from "../charts";
import { defaultPayoffDraft } from "../payoffDraftDefaults";
import { DeleteDebtModal } from "../modals/DeleteDebtModal";
import type { ChiselMainView } from "./ChiselMainView";

export class PayoffMainContent {
	private chart: { destroy(): void } | null = null;
	private resultsEl: HTMLElement | null = null;
	private debounceTimer: number | null = null;

	constructor(
		private plugin: ChiselPlugin,
		private host: ChiselMainView,
	) {}

	destroy(): void {
		if (this.debounceTimer != null) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.destroyChart();
	}

	private destroyChart(): void {
		if (this.chart) {
			this.chart.destroy();
			this.chart = null;
		}
	}

	render(container: HTMLElement): void {
		this.destroy();
		container.empty();

		const debt = this.plugin.debts.find((d) => d.id === this.plugin.chiselViewState.selectedDebtId) ?? null;
		if (!debt) {
			container.createDiv({
				cls: "chisel-main-empty",
				text: this.plugin.debts.length === 0 ? "Add a debt from the sidebar toolbar." : "Select a debt from the list or open the dashboard.",
			});
			return;
		}

		const nav = container.createDiv({ cls: "chisel-detail-nav" });
		const dashLink = nav.createEl("button", {
			type: "button",
			text: "← Dashboard",
			cls: "chisel-text-link",
		});
		dashLink.addEventListener("click", () => {
			this.plugin.chiselViewState.mainMode = "dashboard";
			this.plugin.chiselViewState.selectedDebtId = null;
			this.host.render();
		});

		const header = container.createDiv({ cls: "chisel-main-header" });
		header.createEl("h2", { text: "Debt details", cls: "chisel-main-title" });

		const draft = this.plugin.getPayoffDraft(debt.id) ?? defaultPayoffDraft(debt);
		if (!this.plugin.getPayoffDraft(debt.id)) {
			this.plugin.setPayoffDraft(debt.id, draft);
		}

		const meta = container.createDiv({ cls: "chisel-detail-meta" });
		let editName = debt.name;
		let editBalance = String(debt.balance);
		let editStandardApr = String(debt.standardApr);
		let editUsePromo = Boolean(debt.promo);
		let editPromoApr = debt.promo ? String(debt.promo.apr) : "";
		let editPromoEnds = debt.promo?.endsOn ?? "";

		new Setting(meta).setName("Name").addText((t) => {
			t.setValue(editName).onChange((v) => {
				editName = v;
			});
		});

		new Setting(meta).setName("Balance").addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.step = "any";
			t.setValue(editBalance).onChange((v) => {
				editBalance = v;
			});
		});

		new Setting(meta).setName("Standard APR (%)").setDesc("Annual rate after promo ends.").addText((t) => {
			t.setValue(editStandardApr).onChange((v) => {
				editStandardApr = v;
			});
		});

		let promoAprSetting: Setting;
		let promoEndSetting: Setting;
		const syncPromoFields = (): void => {
			promoAprSetting.settingEl.toggleClass("chisel-modal-hidden", !editUsePromo);
			promoEndSetting.settingEl.toggleClass("chisel-modal-hidden", !editUsePromo);
		};

		promoAprSetting = new Setting(meta).setName("Promo APR (%)").addText((t) => {
			t.setValue(editPromoApr).onChange((v) => {
				editPromoApr = v;
			});
		});

		promoEndSetting = new Setting(meta)
			.setName("Promo ends (YYYY-MM-DD)")
			.setDesc("Promo APR applies through this calendar day (local).")
			.addText((t) => {
				t.setValue(editPromoEnds).onChange((v) => {
					editPromoEnds = v.trim();
				});
			});

		new Setting(meta).setName("Promotional rate").addToggle((tg) => {
			tg.setValue(editUsePromo).onChange((v) => {
				editUsePromo = v;
				syncPromoFields();
			});
		});

		syncPromoFields();

		const actionsRow = meta.createDiv({ cls: "chisel-detail-actions" });
		const saveBtn = actionsRow.createEl("button", { type: "button", text: "Save debt", cls: "mod-cta" });
		const delBtn = actionsRow.createEl("button", {
			type: "button",
			text: "Delete…",
			cls: "chisel-btn-danger",
		});

		saveBtn.addEventListener("click", () => {
			void this.saveDebtEdits(debt.id, {
				name: editName,
				balanceStr: editBalance,
				standardAprStr: editStandardApr,
				usePromo: editUsePromo,
				promoAprStr: editPromoApr,
				promoEndsStr: editPromoEnds,
			});
		});

		delBtn.addEventListener("click", () => {
			new DeleteDebtModal(this.plugin.app, `Permanently remove “${debt.name}”?`, async () => {
				this.plugin.debts = this.plugin.debts.filter((d) => d.id !== debt.id);
				this.plugin.deletePayoffDraft(debt.id);
				if (this.plugin.debts.length === 0) {
					this.plugin.chiselViewState.mainMode = "dashboard";
					this.plugin.chiselViewState.selectedDebtId = null;
				} else {
					this.plugin.chiselViewState.selectedDebtId = this.plugin.debts[0]!.id;
				}
				await this.plugin.persist();
				this.host.render();
			}).open();
		});

		let primaryStr = draft.primary;
		let compareStr = draft.compare;

		const controls = container.createDiv({ cls: "chisel-main-controls" });

		new Setting(controls).setName("Monthly payment").setDesc("Fixed payment each month (after daily interest accrues).").addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.step = "any";
			t.setValue(primaryStr).onChange((v) => {
				primaryStr = v;
				this.plugin.setPayoffDraft(debt.id, { primary: primaryStr, compare: compareStr });
				this.scheduleRedraw(debt.id);
			});
		});

		new Setting(controls)
			.setName("Compare payment (optional)")
			.setDesc("Second scenario on the chart; leave empty to hide.")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.step = "any";
				t.setValue(compareStr).onChange((v) => {
					compareStr = v;
					this.plugin.setPayoffDraft(debt.id, { primary: primaryStr, compare: compareStr });
					this.scheduleRedraw(debt.id);
				});
			});

		const actions = controls.createDiv({ cls: "chisel-main-actions" });
		const updateBtn = actions.createEl("button", {
			type: "button",
			text: "Update projection",
			cls: "mod-cta",
		});
		updateBtn.addEventListener("click", () => void this.redrawResults(debt, primaryStr, compareStr));

		this.resultsEl = container.createDiv({ cls: "chisel-main-results" });
		void this.redrawResults(debt, primaryStr, compareStr);
	}

	private scheduleRedraw(debtId: string): void {
		if (this.debounceTimer != null) window.clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => {
			this.debounceTimer = null;
			const d = this.plugin.getPayoffDraft(debtId);
			const debtFresh = this.plugin.debts.find((x) => x.id === debtId);
			if (d && debtFresh) void this.redrawResults(debtFresh, d.primary, d.compare);
		}, 450);
	}

	private async saveDebtEdits(
		debtId: string,
		fields: {
			name: string;
			balanceStr: string;
			standardAprStr: string;
			usePromo: boolean;
			promoAprStr: string;
			promoEndsStr: string;
		},
	): Promise<void> {
		const name = fields.name.trim();
		if (!name) {
			new Notice("Name is required.");
			return;
		}
		const balance = Number.parseFloat(fields.balanceStr);
		if (!Number.isFinite(balance) || balance < 0) {
			new Notice("Enter a valid balance.");
			return;
		}
		const standardApr = Number.parseFloat(fields.standardAprStr);
		if (!Number.isFinite(standardApr) || standardApr < 0) {
			new Notice("Enter a valid standard APR.");
			return;
		}

		let promo: Debt["promo"] | undefined;
		if (fields.usePromo) {
			const apr = Number.parseFloat(fields.promoAprStr);
			if (!Number.isFinite(apr) || apr < 0) {
				new Notice("Enter a valid promo APR.");
				return;
			}
			const ends = fields.promoEndsStr.trim();
			if (!/^\d{4}-\d{2}-\d{2}$/.test(ends)) {
				new Notice("Promo end date must be YYYY-MM-DD.");
				return;
			}
			const [y, m, d] = ends.split("-").map((x) => Number.parseInt(x, 10));
			const dt = new Date(y, m - 1, d);
			if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
				new Notice("Invalid promo end date.");
				return;
			}
			promo = { apr, endsOn: ends };
		}

		const idx = this.plugin.debts.findIndex((d) => d.id === debtId);
		if (idx < 0) return;
		const prev = this.plugin.debts[idx]!;
		const prevBalance = prev.balance;

		const next: Debt = { id: debtId, name, balance, standardApr, ...(promo ? { promo } : {}) };
		this.plugin.debts[idx] = next;

		if (Math.abs(prevBalance - balance) > 1e-6) {
			this.plugin.deletePayoffDraft(debtId);
		}

		await this.plugin.persist();
		new Notice("Debt saved.");
		this.host.render();
	}

	private async redrawResults(debt: Debt, primaryStr: string, compareStr: string): Promise<void> {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		this.destroyChart();

		const debtLive = this.plugin.debts.find((d) => d.id === debt.id) ?? debt;

		const primaryPay = Number.parseFloat(primaryStr);
		if (!Number.isFinite(primaryPay) || primaryPay <= 0) {
			this.resultsEl.createDiv({ cls: "chisel-muted", text: "Enter a valid monthly payment." });
			return;
		}

		const primarySim = simulatePayoff({ debt: debtLive, monthlyPayment: primaryPay });
		const comparePay = Number.parseFloat(compareStr);
		const compareSim =
			Number.isFinite(comparePay) && comparePay > 0 && Math.abs(comparePay - primaryPay) > 1e-9
				? simulatePayoff({ debt: debtLive, monthlyPayment: comparePay })
				: null;

		const summary = this.resultsEl.createDiv({ cls: "chisel-summary-strip" });
		const fmt = (n: number) => formatMoney(n, this.plugin.settings);

		const col = (label: string, value: string) => {
			const c = summary.createDiv({ cls: "chisel-summary-col" });
			c.createDiv({ cls: "chisel-summary-label", text: label });
			c.createDiv({ cls: "chisel-summary-value", text: value });
		};

		col(
			"Months to payoff",
			primarySim.paidOff && primarySim.monthsToPayoff != null
				? String(primarySim.monthsToPayoff)
				: primarySim.paidOff
					? "0"
					: "40+ yrs (raise payment)",
		);
		col("Total interest", fmt(primarySim.totalInterest));
		col("Total paid", fmt(primarySim.totalPaid));

		if (compareSim) {
			const line =
				compareSim.paidOff && compareSim.monthsToPayoff != null
					? `Compare: ${compareSim.monthsToPayoff} mo · interest ${fmt(compareSim.totalInterest)}`
					: `Compare: not paid within horizon · interest ${fmt(compareSim.totalInterest)}+`;
			summary.createDiv({ cls: "chisel-summary-compare", text: line });
		}

		const chartWrap = this.resultsEl.createDiv({ cls: "chisel-chart-wrap" });
		chartWrap.createEl("h3", { text: "Balance after each payment", cls: "chisel-section-title" });
		const canvas = chartWrap.createEl("canvas", { cls: "chisel-chart-canvas" });

		const series = [
			{
				label: `${fmt(primaryPay)}/mo`,
				rows: primarySim.rows,
				borderColor: "var(--interactive-accent)",
			},
		];
		if (compareSim) {
			series.push({
				label: `${fmt(comparePay)}/mo`,
				rows: compareSim.rows,
				borderColor: "var(--text-muted)",
			});
		}

		try {
			if (series.some((s) => s.rows.length > 0)) {
				this.chart = await renderBalancePayoffChart(canvas, series);
			} else {
				chartWrap.createDiv({
					cls: "chisel-muted",
					text: "No payment schedule (balance may already be zero).",
				});
			}
		} catch (e) {
			console.warn("Chisel chart:", e);
			chartWrap.createDiv({ cls: "chisel-muted", text: "Chart unavailable." });
		}

		const tableSection = this.resultsEl.createDiv({ cls: "chisel-table-section" });
		tableSection.createEl("h3", { text: "Amortization (primary payment)", cls: "chisel-section-title" });

		if (primarySim.rows.length === 0) {
			tableSection.createDiv({
				cls: "chisel-muted",
				text: primarySim.paidOff ? "No rows — already paid off." : "Payment too low to reduce balance; increase payment.",
			});
			return;
		}

		const scroll = tableSection.createDiv({ cls: "chisel-table-scroll" });
		const table = scroll.createEl("table", { cls: "chisel-am-table" });
		const thead = table.createEl("thead");
		const hr = thead.createEl("tr");
		for (const h of ["#", "Date", "Payment", "Interest", "Principal", "Balance"]) {
			hr.createEl("th", { text: h });
		}
		const tbody = table.createEl("tbody");
		for (const r of primarySim.rows) {
			const tr = tbody.createEl("tr");
			tr.createEl("td", { text: String(r.monthIndex) });
			tr.createEl("td", { text: r.paymentDate });
			tr.createEl("td", { text: fmt(r.payment) });
			tr.createEl("td", { text: fmt(r.interestThisPeriod) });
			tr.createEl("td", { text: fmt(r.principalPortion) });
			tr.createEl("td", { text: fmt(r.balanceAfter) });
		}
	}
}
