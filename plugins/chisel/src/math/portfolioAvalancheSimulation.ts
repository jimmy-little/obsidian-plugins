import type { Debt } from "../types";
import { dedupeDebtsById } from "../debtDedupe";
import { estimatedMinimumMonthlyPayment } from "./minimumPayment";
import { rankingAprForDebt } from "./paymentRecommendation";
import {
	dateKeyLocal,
	effectiveAnnualAprPercent,
	paymentAnniversaryDate,
	startOfLocalDay,
} from "./payoffSimulation";
import type { AggregatePeriodRow } from "./aggregatePayoff";

const BALANCE_EPS = 1e-6;
const MAX_CALENDAR_DAYS = 365 * 40 + 366;

function sumBalances(balances: Map<string, number>): number {
	let s = 0;
	for (const v of balances.values()) {
		if (v > BALANCE_EPS) s += v;
	}
	return s;
}

/**
 * One month’s pool is the **sum of every card’s “monthly payment” field** (even after a card is paid off),
 * so dollars roll over to remaining balances (avalanche).
 */
function totalMonthlyPool(debts: Debt[], getMonthlyPayment: (debtId: string) => number): number {
	return debts.reduce((a, d) => a + Math.max(0, getMonthlyPayment(d.id)), 0);
}

/**
 * After interest has accrued for the period, pay `pool` across debts:
 * estimated minimums first (scaled down if the pool is short), then avalanche remainder by `rankingAprForDebt`.
 */
function allocateMonthlyPool(
	debts: Debt[],
	balances: Map<string, number>,
	pool: number,
	payDate: Date,
): { totalApplied: number; poolUnapplied: number } {
	const alloc = new Map<string, number>(debts.map((d) => [d.id, 0]));
	let remaining = pool;
	const active = debts.filter((d) => (balances.get(d.id) ?? 0) > BALANCE_EPS);
	if (active.length === 0 || remaining <= BALANCE_EPS) {
		return { totalApplied: pool - remaining, poolUnapplied: remaining };
	}

	const mins = new Map<string, number>();
	for (const d of active) {
		const b = balances.get(d.id)!;
		const m = estimatedMinimumMonthlyPayment({ ...d, balance: b }, payDate);
		mins.set(d.id, Math.min(m, b));
	}
	const sumM = [...mins.values()].reduce((a, b) => a + b, 0);

	if (sumM > BALANCE_EPS && remaining + BALANCE_EPS < sumM) {
		const scale = remaining / sumM;
		for (const d of active) {
			const want = (mins.get(d.id) ?? 0) * scale;
			const b = balances.get(d.id)!;
			const pay = Math.min(want, b, remaining);
			alloc.set(d.id, (alloc.get(d.id) ?? 0) + pay);
			balances.set(d.id, b - pay);
			remaining -= pay;
		}
	} else {
		for (const d of active) {
			const want = mins.get(d.id) ?? 0;
			const b = balances.get(d.id)!;
			const pay = Math.min(want, b, remaining);
			alloc.set(d.id, (alloc.get(d.id) ?? 0) + pay);
			balances.set(d.id, b - pay);
			remaining -= pay;
		}
	}

	while (remaining > BALANCE_EPS) {
		const withBal = debts.filter((d) => (balances.get(d.id) ?? 0) > BALANCE_EPS);
		if (withBal.length === 0) break;
		withBal.sort(
			(a, b) =>
				rankingAprForDebt(b, payDate) - rankingAprForDebt(a, payDate) ||
				(balances.get(b.id)! - balances.get(a.id)!),
		);
		let progressed = false;
		for (const d of withBal) {
			if (remaining <= BALANCE_EPS) break;
			const b = balances.get(d.id)!;
			if (b <= BALANCE_EPS) continue;
			const pay = Math.min(remaining, b);
			alloc.set(d.id, (alloc.get(d.id) ?? 0) + pay);
			balances.set(d.id, b - pay);
			remaining -= pay;
			progressed = true;
		}
		if (!progressed) break;
	}

	return { totalApplied: pool - remaining, poolUnapplied: remaining };
}

export type PerDebtAvalancheSummary = {
	debtId: string;
	totalInterestAttributed: number;
	monthsUntilPaid: number | null;
};

export type PortfolioAvalancheResult = {
	aggregateRows: AggregatePeriodRow[];
	/** Balance after each payment period (same length as aggregateRows). */
	perDebtBalanceSeries: { debtId: string; balancesAfterPayment: number[] }[];
	totalInterest: number;
	totalPaid: number;
	paidOff: boolean;
	monthsToPayoff: number | null;
	/** Sum of per-card “monthly payment” inputs — rolls over as cards are paid. */
	monthlyPool: number;
	/** When pool can’t cover estimated minimums, interest can still grow. */
	poolBelowMinimums: boolean;
	perDebtSummaries: PerDebtAvalancheSummary[];
};

/**
 * Shared calendar: all debts accrue daily in parallel. On each payment anniversary, one **combined**
 * monthly pool (sum of every card’s budgeted payment) pays estimated minimums on open balances, then
 * applies the remainder to the highest ranking APR (avalanche), rolling automatically as balances hit zero.
 */
export function simulatePortfolioAvalanche(
	debts: Debt[],
	getMonthlyPayment: (debtId: string) => number,
	startDate?: Date,
): PortfolioAvalancheResult {
	const uniqueDebts = dedupeDebtsById(debts);
	const start = startOfLocalDay(startDate ?? new Date());
	const balances = new Map<string, number>();
	for (const d of uniqueDebts) {
		balances.set(d.id, Math.max(0, d.balance));
	}

	const poolConstant = totalMonthlyPool(uniqueDebts, getMonthlyPayment);
	const aggregateRows: AggregatePeriodRow[] = [];
	const perDebtBalanceSeries = uniqueDebts.map((d) => ({ debtId: d.id, balancesAfterPayment: [] as number[] }));
	const cumInterestById = new Map<string, number>(uniqueDebts.map((d) => [d.id, 0]));
	let totalInterest = 0;
	let totalPaid = 0;
	let poolBelowMinimums = false;

	if (uniqueDebts.length === 0 || sumBalances(balances) <= BALANCE_EPS) {
		return {
			aggregateRows: [],
			perDebtBalanceSeries,
			totalInterest: 0,
			totalPaid: 0,
			paidOff: true,
			monthsToPayoff: 0,
			monthlyPool: poolConstant,
			poolBelowMinimums: false,
			perDebtSummaries: [],
		};
	}

	if (poolConstant <= BALANCE_EPS) {
		return {
			aggregateRows: [],
			perDebtBalanceSeries,
			totalInterest: 0,
			totalPaid: 0,
			paidOff: false,
			monthsToPayoff: null,
			monthlyPool: 0,
			poolBelowMinimums: true,
			perDebtSummaries: uniqueDebts.map((d) => ({
				debtId: d.id,
				totalInterestAttributed: 0,
				monthsUntilPaid: null,
			})),
		};
	}

	const day = new Date(start.getTime());
	let nextPaymentIndex = 1;
	let nextPayKey = dateKeyLocal(paymentAnniversaryDate(start, nextPaymentIndex));
	let periodInterestById = new Map<string, number>();
	let dayCount = 0;
	let paidOff = false;

	while (sumBalances(balances) > BALANCE_EPS && dayCount < MAX_CALENDAR_DAYS) {
		for (const d of uniqueDebts) {
			const b = balances.get(d.id) ?? 0;
			if (b <= BALANCE_EPS) continue;
			const apr = effectiveAnnualAprPercent(d, day);
			const di = b * (apr / 100) / 365;
			balances.set(d.id, b + di);
			periodInterestById.set(d.id, (periodInterestById.get(d.id) ?? 0) + di);
			totalInterest += di;
			cumInterestById.set(d.id, (cumInterestById.get(d.id) ?? 0) + di);
		}

		const key = dateKeyLocal(day);
		if (key === nextPayKey) {
			const payDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());
			const periodInterestTotal = uniqueDebts.reduce((a, d) => a + (periodInterestById.get(d.id) ?? 0), 0);

			const active = uniqueDebts.filter((d) => (balances.get(d.id) ?? 0) > BALANCE_EPS);
			const sumM = active.reduce((acc, d) => {
				const b = balances.get(d.id)!;
				const m = estimatedMinimumMonthlyPayment({ ...d, balance: b }, payDate);
				return acc + Math.min(m, b);
			}, 0);
			if (poolConstant + BALANCE_EPS < sumM) poolBelowMinimums = true;

			const { totalApplied } = allocateMonthlyPool(uniqueDebts, balances, poolConstant, payDate);
			totalPaid += totalApplied;

			const totalBal = sumBalances(balances);
			aggregateRows.push({
				periodIndex: nextPaymentIndex,
				paymentDate: key,
				totalPayment: totalApplied,
				totalInterest: periodInterestTotal,
				totalPrincipal: totalApplied - periodInterestTotal,
				totalBalance: totalBal,
			});

			for (const s of perDebtBalanceSeries) {
				s.balancesAfterPayment.push(Math.max(0, balances.get(s.debtId) ?? 0));
			}

			periodInterestById = new Map();
			nextPaymentIndex += 1;
			nextPayKey = dateKeyLocal(paymentAnniversaryDate(start, nextPaymentIndex));

			if (sumBalances(balances) <= BALANCE_EPS) {
				paidOff = true;
				break;
			}
		}

		day.setDate(day.getDate() + 1);
		dayCount += 1;
	}

	const monthsToPayoff = paidOff ? aggregateRows.length : null;

	const perDebtSummaries: PerDebtAvalancheSummary[] = perDebtBalanceSeries.map((s) => {
		const initial = uniqueDebts.find((d) => d.id === s.debtId)?.balance ?? 0;
		let monthsUntilPaid: number | null = null;
		if (initial > BALANCE_EPS) {
			for (let i = 0; i < s.balancesAfterPayment.length; i++) {
				if (s.balancesAfterPayment[i]! <= BALANCE_EPS) {
					monthsUntilPaid = i + 1;
					break;
				}
			}
		}
		return {
			debtId: s.debtId,
			totalInterestAttributed: cumInterestById.get(s.debtId) ?? 0,
			monthsUntilPaid,
		};
	});

	return {
		aggregateRows,
		perDebtBalanceSeries,
		totalInterest,
		totalPaid,
		paidOff,
		monthsToPayoff,
		monthlyPool: poolConstant,
		poolBelowMinimums,
		perDebtSummaries,
	};
}
