import type { Debt } from "../types";
import { dedupeDebtsById } from "../debtDedupe";
import { dateKeyLocal, effectiveAnnualAprPercent } from "./payoffSimulation";
import { estimatedMinimumMonthlyPayment } from "./minimumPayment";

/** Promo “expiring soon” for warnings (days inclusive). */
export const PROMO_EXPIRING_WARN_DAYS = 90;

/** Blend post-revert APR into ranking as promo end approaches (days). */
export const PROMO_RANKING_BLEND_DAYS = 120;

export type PromoWarning = {
	debtId: string;
	debtName: string;
	endsOn: string;
	daysRemaining: number;
	message: string;
};

export type BudgetFeasibility = {
	feasible: boolean;
	totalMinimum: number;
	totalBudget: number;
	shortfall: number;
};

export type RankedDebt = {
	rank: number;
	debt: Debt;
	minimumPayment: number;
	suggestedPayment: number;
	/** APR used for avalanche-style ordering (blends toward standard when promo ends soon). */
	rankingApr: number;
	/** APR in effect today (statement-style). */
	effectiveAprToday: number;
	notes: string[];
};

export type PaymentRecommendation = {
	feasibility: BudgetFeasibility;
	promoWarnings: PromoWarning[];
	ranked: RankedDebt[];
	/** Sum of suggested payments (equals totalBudget when feasible). */
	totalSuggested: number;
	surplusOverMinimums: number;
};

function parseLocalDate(ymd: string): Date {
	const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
	return new Date(y, m - 1, d);
}

/** Whole calendar days from `asOf` start to `endsOn` inclusive (promo still active on endsOn). */
export function daysRemainingOnPromo(debt: Debt, asOf: Date = new Date()): number | null {
	if (!debt.promo) return null;
	const end = parseLocalDate(debt.promo.endsOn);
	const start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
	const ms = end.getTime() - start.getTime();
	return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * APR used to **sort** debts for extra payment (avalanche + urgency when revert is near).
 * Low promo APR cards rank lower unless the revert date is close, then we blend toward `standardApr`.
 */
export function rankingAprForDebt(debt: Debt, asOf: Date = new Date()): number {
	const todayApr = effectiveAnnualAprPercent(debt, asOf);
	if (!debt.promo) return todayApr;
	const left = daysRemainingOnPromo(debt, asOf);
	if (left == null || left < 0) return debt.standardApr;
	const revertLift = Math.max(0, debt.standardApr - debt.promo.apr);
	if (revertLift <= 0 || left >= PROMO_RANKING_BLEND_DAYS) return todayApr;
	const t = 1 - Math.min(left, PROMO_RANKING_BLEND_DAYS) / PROMO_RANKING_BLEND_DAYS;
	return todayApr + revertLift * t * 0.65;
}

function collectPromoWarnings(debts: Debt[], asOf: Date): PromoWarning[] {
	const out: PromoWarning[] = [];
	const key = dateKeyLocal(asOf);
	for (const d of debts) {
		if (!d.promo) continue;
		if (d.promo.endsOn < key) continue;
		const days = daysRemainingOnPromo(d, asOf);
		if (days == null || days < 0 || days > PROMO_EXPIRING_WARN_DAYS) continue;
		out.push({
			debtId: d.id,
			debtName: d.name,
			endsOn: d.promo.endsOn,
			daysRemaining: days,
			message:
				days <= 30
					? `Promo ends in ${days}d — balance may soon accrue at ${d.standardApr.toFixed(2)}% APR.`
					: `Promo ends in ${days}d (${d.promo.endsOn}); plan for ${d.standardApr.toFixed(2)}% APR after.`,
		});
	}
	out.sort((a, b) => a.daysRemaining - b.daysRemaining);
	return out;
}

/**
 * Allocate `totalBudget` across debts: each pays at least estimated minimum; remaining
 * goes to the highest `rankingApr` debt (single-target avalanche for this month).
 */
export function recommendPayments(totalBudget: number, debts: Debt[], asOf: Date = new Date()): PaymentRecommendation {
	const uniqueDebts = dedupeDebtsById(debts);
	const active = uniqueDebts.filter((d) => d.balance > 1e-6);
	const mins = new Map<string, number>();
	let totalMin = 0;
	for (const d of active) {
		const m = estimatedMinimumMonthlyPayment(d, asOf);
		mins.set(d.id, m);
		totalMin += m;
	}

	const feasibility: BudgetFeasibility = {
		feasible: totalBudget + 1e-6 >= totalMin,
		totalMinimum: Math.round(totalMin * 100) / 100,
		totalBudget: totalBudget,
		shortfall: Math.max(0, Math.round((totalMin - totalBudget) * 100) / 100),
	};

	const promoWarnings = collectPromoWarnings(uniqueDebts, asOf);

	if (active.length === 0) {
		return {
			feasibility,
			promoWarnings,
			ranked: [],
			totalSuggested: 0,
			surplusOverMinimums: Math.max(0, totalBudget),
		};
	}

	if (!feasibility.feasible && totalMin > 1e-9) {
		/** Proportional split when budget can’t cover estimated minimums (best-effort only). */
		const scaled = active.map((debt) => {
			const minimumPayment = mins.get(debt.id)!;
			const share = minimumPayment / totalMin;
			const suggestedPayment = Math.round(totalBudget * share * 100) / 100;
			const rankingApr = rankingAprForDebt(debt, asOf);
			const effectiveAprToday = effectiveAnnualAprPercent(debt, asOf);
			const notes = [
				`Estimated minimum ~${minimumPayment.toFixed(2)}; budget short by ${feasibility.shortfall.toFixed(2)}.`,
				"Shown split is proportional—not issuer-accurate; increase budget or reduce balances.",
			];
			return { rank: 0, debt, minimumPayment, suggestedPayment, rankingApr, effectiveAprToday, notes };
		});
		let drift = Math.round((totalBudget - scaled.reduce((a, r) => a + r.suggestedPayment, 0)) * 100) / 100;
		if (Math.abs(drift) > 1e-9 && scaled.length > 0) {
			const last = scaled[scaled.length - 1]!;
			last.suggestedPayment = Math.round((last.suggestedPayment + drift) * 100) / 100;
		}
		scaled.sort((a, b) => b.rankingApr - a.rankingApr || b.debt.balance - a.debt.balance);
		scaled.forEach((r, i) => {
			r.rank = i + 1;
		});
		return {
			feasibility,
			promoWarnings,
			ranked: scaled,
			totalSuggested: Math.round(totalBudget * 100) / 100,
			surplusOverMinimums: 0,
		};
	}

	const surplus = Math.round((totalBudget - totalMin) * 100) / 100;
	const sorted = [...active].sort(
		(a, b) =>
			rankingAprForDebt(b, asOf) - rankingAprForDebt(a, asOf) ||
			b.standardApr - a.standardApr ||
			b.balance - a.balance,
	);
	const winner = sorted[0]!;

	const suggestedById = new Map<string, number>();
	for (const d of active) {
		suggestedById.set(d.id, mins.get(d.id)!);
	}
	suggestedById.set(winner.id, Math.round((mins.get(winner.id)! + surplus) * 100) / 100);

	const ranked: RankedDebt[] = sorted.map((debt, i) => {
		const minimumPayment = mins.get(debt.id)!;
		const suggestedPayment = suggestedById.get(debt.id)!;
		const rankingApr = rankingAprForDebt(debt, asOf);
		const effectiveAprToday = effectiveAnnualAprPercent(debt, asOf);
		const notes: string[] = [];
		if (debt.id === winner.id && surplus > 1e-6) {
			notes.push(`Apply extra ${surplus.toFixed(2)} here first (avalanche: highest ranking APR).`);
		} else if (surplus > 1e-6) {
			notes.push("Pay minimum only; roll extra to higher-APR accounts above.");
		}
		if (debt.promo) {
			const dr = daysRemainingOnPromo(debt, asOf);
			if (dr != null && dr >= 0 && dr <= PROMO_EXPIRING_WARN_DAYS) {
				notes.push(`Promo ends in ${dr}d.`);
			}
		}
		return {
			rank: i + 1,
			debt,
			minimumPayment,
			suggestedPayment,
			rankingApr,
			effectiveAprToday,
			notes,
		};
	});

	return {
		feasibility,
		promoWarnings,
		ranked,
		totalSuggested: Math.round(totalBudget * 100) / 100,
		surplusOverMinimums: surplus,
	};
}
