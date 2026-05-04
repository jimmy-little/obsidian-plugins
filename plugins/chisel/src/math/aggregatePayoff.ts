import type { Debt } from "../types";
import { simulatePayoff, type PayoffResult } from "./payoffSimulation";

export type PerDebtSim = {
	debtId: string;
	payment: number;
	result: PayoffResult;
};

/**
 * Runs `simulatePayoff` per debt using `getMonthlyPayment(id)` (caller should pass a positive finite payment).
 */
export function simulatePortfolio(
	debts: Debt[],
	getMonthlyPayment: (debtId: string) => number,
): PerDebtSim[] {
	return debts.map((debt) => {
		const payment = getMonthlyPayment(debt.id);
		return {
			debtId: debt.id,
			payment,
			result: simulatePayoff({ debt, monthlyPayment: payment }),
		};
	});
}

export type AggregatePeriodRow = {
	periodIndex: number;
	paymentDate: string;
	totalPayment: number;
	totalInterest: number;
	totalPrincipal: number;
	totalBalance: number;
};

/**
 * Aligns per-debt amortization rows by payment # (all debts share the same simulation start day,
 * so payment dates match across debts). Sums payments, interest, principal, and remaining balances.
 */
export function buildAggregatePeriodTable(sims: PerDebtSim[]): AggregatePeriodRow[] {
	if (sims.length === 0) return [];
	const maxPeriods = Math.max(0, ...sims.map((s) => s.result.rows.length));
	const out: AggregatePeriodRow[] = [];
	for (let k = 0; k < maxPeriods; k++) {
		let totalPayment = 0;
		let totalInterest = 0;
		let totalPrincipal = 0;
		let totalBalance = 0;
		let paymentDate = "";
		for (const s of sims) {
			const row = s.result.rows[k];
			if (row) {
				totalPayment += row.payment;
				totalInterest += row.interestThisPeriod;
				totalPrincipal += row.principalPortion;
				totalBalance += row.balanceAfter;
				if (!paymentDate) paymentDate = row.paymentDate;
			}
		}
		out.push({
			periodIndex: k + 1,
			paymentDate,
			totalPayment,
			totalInterest,
			totalPrincipal,
			totalBalance,
		});
	}
	return out;
}

/** Sum of `totalInterest` from each debt’s full simulation. */
export function sumProjectedInterest(sims: PerDebtSim[]): number {
	return sims.reduce((acc, s) => acc + s.result.totalInterest, 0);
}

/** Total starting balance. */
export function sumBalances(debts: Debt[]): number {
	return debts.reduce((acc, d) => acc + d.balance, 0);
}

/** Months until every debt is paid (max of individual payoff months); null if any debt never pays off in the horizon. */
export function monthsUntilAllPaid(sims: PerDebtSim[]): number | null {
	if (sims.length === 0) return 0;
	if (sims.some((s) => !s.result.paidOff || s.result.monthsToPayoff == null)) return null;
	return Math.max(...sims.map((s) => s.result.monthsToPayoff!));
}
