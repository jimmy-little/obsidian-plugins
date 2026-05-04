import type ChiselPlugin from "../main";
import type { ChiselMainView } from "./ChiselMainView";
import { formatApr, formatMoney } from "../format";
import { defaultPayoffDraft } from "../payoffDraftDefaults";
import { simulatePortfolioAvalanche, type PortfolioAvalancheResult } from "../math/portfolioAvalancheSimulation";
import { sumBalances } from "../math/aggregatePayoff";
import { renderHorizontalBarChart, renderMultiLineNumericChart } from "../charts";
import { recommendPayments } from "../math/paymentRecommendation";

export class DashboardMainContent {
	private charts: { destroy(): void }[] = [];
	private analyticsMount: HTMLElement | null = null;

	constructor(
		private plugin: ChiselPlugin,
		private host: ChiselMainView,
	) {}

	destroy(): void {
		for (const c of this.charts) {
			c.destroy();
		}
		this.charts = [];
		this.analyticsMount = null;
	}

	private getMonthlyPayment(debtId: string): number {
		const debt = this.plugin.debts.find((d) => d.id === debtId);
		if (!debt) return 25;
		let d = this.plugin.getPayoffDraft(debtId);
		if (!d) {
			d = defaultPayoffDraft(debt);
			this.plugin.setPayoffDraft(debtId, d);
		}
		const n = Number.parseFloat(d.primary);
		if (Number.isFinite(n) && n > 0) return n;
		return Number.parseFloat(defaultPayoffDraft(debt).primary);
	}

	private openDebt(id: string): void {
		this.plugin.chiselViewState.mainMode = "debt";
		this.plugin.chiselViewState.selectedDebtId = id;
		this.host.render();
	}

	render(container: HTMLElement): void {
		this.destroy();
		container.empty();

		const head = container.createDiv({ cls: "chisel-dash-header" });
		head.createEl("h2", { text: "Dashboard", cls: "chisel-main-title" });
		head.createDiv({
			cls: "chisel-main-sub",
			text: "Combined balances, per-debt payments, and total payoff across all cards (same simulation rules as detail).",
		});

		if (this.plugin.debts.length === 0) {
			container.createDiv({
				cls: "chisel-main-empty",
				text: "Add a debt from the + button to get started.",
			});
			return;
		}

		const recPanel = container.createDiv({ cls: "chisel-recommend-panel" });
		recPanel.createEl("h3", { text: "Recommended allocation", cls: "chisel-section-title" });
		recPanel.createDiv({
			cls: "chisel-recommend-desc",
			text: "Enter your total monthly budget for cards. We estimate each account’s minimum, rank debts by effective APR (with extra weight as promos end), then put all surplus on the top-ranked account (avalanche).",
		});

		const budgetRow = recPanel.createDiv({ cls: "chisel-recommend-budget-row" });
		budgetRow.createSpan({ text: "Total monthly budget", cls: "chisel-recommend-label" });
		const budgetInp = budgetRow.createEl("input", {
			type: "number",
			cls: "chisel-dash-pay-input chisel-recommend-budget-input",
			attr: { step: "any", placeholder: "e.g. 1200" },
		});
		budgetInp.value = this.plugin.recommendationBudgetStr;
		budgetInp.addEventListener("input", () => {
			this.plugin.recommendationBudgetStr = budgetInp.value;
		});

		const applyRecBtn = budgetRow.createEl("button", {
			type: "button",
			text: "Apply to payments",
			cls: "mod-cta",
		});
		applyRecBtn.addEventListener("click", () => {
			const b = Number.parseFloat(this.plugin.recommendationBudgetStr);
			if (!Number.isFinite(b) || b <= 0) return;
			const rec = recommendPayments(b, this.plugin.debts);
			for (const r of rec.ranked) {
				const prev = this.plugin.getPayoffDraft(r.debt.id);
				this.plugin.setPayoffDraft(r.debt.id, {
					primary: r.suggestedPayment.toFixed(2),
					compare: prev?.compare ?? "",
				});
			}
			this.host.render();
		});

		const budgetNum = Number.parseFloat(this.plugin.recommendationBudgetStr);
		if (Number.isFinite(budgetNum) && budgetNum > 0) {
			const rec = recommendPayments(budgetNum, this.plugin.debts);
			if (rec.ranked.length === 0) {
				recPanel.createDiv({
					cls: "chisel-muted",
					text: "No card balances to allocate (add debts or set balances above zero).",
				});
			} else {
				if (!rec.feasibility.feasible) {
					recPanel.createDiv({
						cls: "chisel-recommend-alert chisel-recommend-alert--warn",
						text: `Budget ${formatMoney(rec.feasibility.totalBudget, this.plugin.settings)} is below combined estimated minimums (${formatMoney(rec.feasibility.totalMinimum, this.plugin.settings)}). Short by ${formatMoney(rec.feasibility.shortfall, this.plugin.settings)}. Showing proportional split only.`,
					});
				} else if (rec.surplusOverMinimums > 0) {
					recPanel.createDiv({
						cls: "chisel-recommend-alert chisel-recommend-alert--ok",
						text: `After minimums (${formatMoney(rec.feasibility.totalMinimum, this.plugin.settings)}), ${formatMoney(rec.surplusOverMinimums, this.plugin.settings)} extra goes to the highest-priority account below.`,
					});
				} else {
					recPanel.createDiv({
						cls: "chisel-recommend-alert chisel-recommend-alert--ok",
						text: "Budget matches estimated minimums only—no extra avalanche payment until you increase the budget.",
					});
				}

				if (rec.promoWarnings.length > 0) {
					const wul = recPanel.createEl("ul", { cls: "chisel-recommend-warnings" });
					for (const w of rec.promoWarnings) {
						wul.createEl("li", { text: `${w.debtName}: ${w.message}` });
					}
				}

				const recTableWrap = recPanel.createDiv({ cls: "chisel-table-scroll chisel-recommend-table-wrap" });
				const rt = recTableWrap.createEl("table", { cls: "chisel-am-table chisel-recommend-table" });
				const rh = rt.createEl("thead").createEl("tr");
				for (const h of ["#", "Debt", "Min (est.)", "Suggested", "APR (rank)", "APR today", "Notes"]) {
					rh.createEl("th", { text: h });
				}
				const rtb = rt.createEl("tbody");
				for (const r of rec.ranked) {
					const tr = rtb.createEl("tr");
					tr.createEl("td", { text: String(r.rank), cls: "chisel-tabular" });
					const nameTd = tr.createEl("td");
					const link = nameTd.createEl("button", {
						type: "button",
						text: r.debt.name,
						cls: "chisel-debt-title-link",
					});
					link.addEventListener("click", () => this.openDebt(r.debt.id));
					tr.createEl("td", { text: formatMoney(r.minimumPayment, this.plugin.settings), cls: "chisel-tabular" });
					tr.createEl("td", { text: formatMoney(r.suggestedPayment, this.plugin.settings), cls: "chisel-tabular" });
					tr.createEl("td", { text: `${r.rankingApr.toFixed(2)}%`, cls: "chisel-tabular" });
					tr.createEl("td", { text: `${r.effectiveAprToday.toFixed(2)}%`, cls: "chisel-tabular" });
					tr.createEl("td", { cls: "chisel-recommend-notes", text: r.notes.join(" ") });
				}
			}
		} else {
			recPanel.createDiv({
				cls: "chisel-muted",
				text: "Enter a positive budget to see ranking, minimums, and promo alerts.",
			});
		}

		const toolbar = container.createDiv({ cls: "chisel-dash-toolbar" });
		const refreshBtn = toolbar.createEl("button", {
			type: "button",
			text: "Update projections",
			cls: "mod-cta",
		});
		refreshBtn.addEventListener("click", () => this.host.render());
		toolbar.createSpan({
			cls: "chisel-dash-toolbar-hint",
			text: "After changing payments in the table, click to refresh charts and totals.",
		});

		const avalanche = simulatePortfolioAvalanche(this.plugin.debts, (id) => this.getMonthlyPayment(id));
		const summaryById = new Map(avalanche.perDebtSummaries.map((s) => [s.debtId, s]));

		this.analyticsMount = container.createDiv({ cls: "chisel-dash-analytics" });
		void this.renderAnalytics(this.analyticsMount, avalanche);

		const tableSection = container.createDiv({ cls: "chisel-dash-table-section" });
		tableSection.createEl("h3", { text: "Debts", cls: "chisel-section-title" });
		tableSection.createDiv({
			cls: "chisel-dash-table-note",
			text: "Months and interest reflect the combined forecast: one monthly pool (sum of the payment column) with minimums on open balances, then avalanche to highest APR—freed cash rolls over as cards are paid off.",
		});
		const scroll = tableSection.createDiv({ cls: "chisel-table-scroll" });
		const table = scroll.createEl("table", { cls: "chisel-am-table chisel-dash-debts-table" });
		const hr = table.createEl("thead").createEl("tr");
		for (const h of ["Name", "Balance", "APR", "Monthly payment", "Mo (pool)", "Interest (pool)"]) {
			hr.createEl("th", { text: h });
		}
		const tbody = table.createEl("tbody");

		for (const debt of this.plugin.debts) {
			const draft = this.plugin.getPayoffDraft(debt.id) ?? defaultPayoffDraft(debt);
			if (!this.plugin.getPayoffDraft(debt.id)) {
				this.plugin.setPayoffDraft(debt.id, draft);
			}

			const ps = summaryById.get(debt.id);
			const months =
				debt.balance <= 1e-6
					? "—"
					: ps?.monthsUntilPaid != null
						? String(ps.monthsUntilPaid)
						: avalanche.paidOff
							? "—"
							: avalanche.monthlyPool <= 0
								? "—"
								: "40+";
			const interestStr = formatMoney(ps?.totalInterestAttributed ?? 0, this.plugin.settings);

			const tr = tbody.createEl("tr");
			const nameTd = tr.createEl("td");
			const link = nameTd.createEl("button", {
				type: "button",
				text: debt.name,
				cls: "chisel-debt-title-link",
			});
			link.addEventListener("click", () => this.openDebt(debt.id));

			tr.createEl("td", { text: formatMoney(debt.balance, this.plugin.settings) });
			tr.createEl("td", {
				text: debt.promo
					? `${formatApr(debt.promo.apr)} → ${formatApr(debt.standardApr)}`
					: formatApr(debt.standardApr),
			});

			const payTd = tr.createEl("td");
			const inp = payTd.createEl("input", {
				type: "number",
				cls: "chisel-dash-pay-input",
				attr: { step: "any" },
			});
			inp.value = draft.primary;
			inp.addEventListener("input", () => {
				this.plugin.setPayoffDraft(debt.id, { primary: inp.value, compare: draft.compare });
			});

			tr.createEl("td", { text: months, cls: "chisel-tabular" });
			tr.createEl("td", { text: interestStr, cls: "chisel-tabular" });
		}

		const foot = tbody.createEl("tr");
		foot.addClass("chisel-dash-tfoot");
		const totalBal = sumBalances(this.plugin.debts);
		const sumInt = avalanche.totalInterest;
		const sumPay = avalanche.monthlyPool;
		const monthsAll = avalanche.monthsToPayoff;
		const fmt = (n: number) => formatMoney(n, this.plugin.settings);
		const t0 = foot.createEl("td", { text: "Totals" });
		t0.colSpan = 2;
		foot.createEl("td", { text: fmt(totalBal), cls: "chisel-tabular" });
		foot.createEl("td", { text: "—" });
		foot.createEl("td", { text: fmt(sumPay), cls: "chisel-tabular" });
		foot.createEl("td", { text: monthsAll != null ? String(monthsAll) : "—", cls: "chisel-tabular" });
		foot.createEl("td", { text: fmt(sumInt), cls: "chisel-tabular" });
	}

	private async renderAnalytics(mount: HTMLElement, av: PortfolioAvalancheResult): Promise<void> {
		mount.empty();
		for (const c of this.charts) {
			c.destroy();
		}
		this.charts = [];

		const aggRows = av.aggregateRows;
		const totalBal = sumBalances(this.plugin.debts);
		const sumInt = av.totalInterest;
		const monthsAll = av.monthsToPayoff;
		const sumPay = av.monthlyPool;

		const fmt = (n: number) => formatMoney(n, this.plugin.settings);
		const summary = mount.createDiv({ cls: "chisel-summary-strip" });
		const col = (label: string, value: string) => {
			const c = summary.createDiv({ cls: "chisel-summary-col" });
			c.createDiv({ cls: "chisel-summary-label", text: label });
			c.createDiv({ cls: "chisel-summary-value", text: value });
		};
		col("Total balance", fmt(totalBal));
		col("Monthly pool (sum of column)", fmt(sumPay));
		col("Projected interest (pool)", fmt(sumInt));
		col("Months until all paid", monthsAll != null ? String(monthsAll) : "40+ yrs");

		if (av.poolBelowMinimums) {
			mount.createDiv({
				cls: "chisel-recommend-alert chisel-recommend-alert--warn",
				text: "Some months the pool is below combined estimated minimums—balances can still grow until you raise the total or lower APRs (see proportional minimum pass in the engine).",
			});
		}

		const maxLen = aggRows.length;
		if (maxLen === 0) {
			mount.createDiv({
				cls: "chisel-muted",
				text:
					av.monthlyPool <= 0
						? "Set positive monthly payments (sum > 0) to see the avalanche forecast."
						: "No amortization rows yet.",
			});
			return;
		}

		const labels = Array.from({ length: maxLen }, (_, i) => String(i + 1));

		const barWrap = mount.createDiv({ cls: "chisel-chart-wrap chisel-chart-wrap--compact" });
		barWrap.createEl("h3", { text: "Current balance by debt", cls: "chisel-section-title" });
		const barCanvas = barWrap.createEl("canvas", { cls: "chisel-chart-canvas" });
		try {
			const c = await renderHorizontalBarChart(
				barCanvas,
				this.plugin.debts.map((d) => ({
					label: d.name.length > 26 ? `${d.name.slice(0, 24)}…` : d.name,
					value: d.balance,
				})),
			);
			this.charts.push(c);
		} catch (e) {
			console.warn("Chisel dashboard bar chart:", e);
			barWrap.createDiv({ cls: "chisel-muted", text: "Bar chart unavailable." });
		}

		const lineWrap = mount.createDiv({ cls: "chisel-chart-wrap" });
		lineWrap.createEl("h3", {
			text: "Total balance after each payment (avalanche + rollover)",
			cls: "chisel-section-title",
		});
		const lineCanvas = lineWrap.createEl("canvas", { cls: "chisel-chart-canvas" });

		const colors = ["#64748b", "#22c55e", "#f97316", "#a855f7", "#0ea5e9"];
		const perDebtSeries = av.perDebtBalanceSeries.slice(0, 5).map((s, i) => ({
			label: (this.plugin.debts.find((d) => d.id === s.debtId)?.name ?? "Debt").slice(0, 20),
			data: Array.from({ length: maxLen }, (_, k) => s.balancesAfterPayment[k] ?? null),
			borderColor: colors[i % colors.length]!,
		}));

		const series = [
			{
				label: "Total owed",
				data: aggRows.map((r) => r.totalBalance),
				borderColor: "var(--interactive-accent)",
			},
			...perDebtSeries,
		];

		try {
			const c = await renderMultiLineNumericChart(lineCanvas, labels, series, "Balance");
			this.charts.push(c);
		} catch (e) {
			console.warn("Chisel dashboard line chart:", e);
			lineWrap.createDiv({ cls: "chisel-muted", text: "Line chart unavailable." });
		}

		const aggSection = mount.createDiv({ cls: "chisel-table-section" });
		aggSection.createEl("h3", {
			text: "Combined amortization (avalanche pool)",
			cls: "chisel-section-title",
		});
		const aggScroll = aggSection.createDiv({ cls: "chisel-table-scroll" });
		const aggTable = aggScroll.createEl("table", { cls: "chisel-am-table" });
		const ahr = aggTable.createEl("thead").createEl("tr");
		for (const h of ["#", "Date", "Payment", "Interest", "Principal", "Balance"]) {
			ahr.createEl("th", { text: h });
		}
		const atbody = aggTable.createEl("tbody");
		for (const r of aggRows) {
			const tr = atbody.createEl("tr");
			tr.createEl("td", { text: String(r.periodIndex) });
			tr.createEl("td", { text: r.paymentDate });
			tr.createEl("td", { text: fmt(r.totalPayment) });
			tr.createEl("td", { text: fmt(r.totalInterest) });
			tr.createEl("td", { text: fmt(r.totalPrincipal) });
			tr.createEl("td", { text: fmt(r.totalBalance) });
		}
	}
}
