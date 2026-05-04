import type { Debt } from "../types";
import { effectiveAnnualAprPercent } from "./payoffSimulation";

/** Card Act–style floor (typical issuer minimum). */
export const MIN_PAYMENT_ABSOLUTE_FLOOR = 25;

/** Portion of statement balance often required in addition to interest (1% common). */
export const MIN_PAYMENT_PERCENT_OF_BALANCE = 0.01;

/**
 * Rough minimum payment: max(floor, 1% of balance + one month’s interest at **today’s**
 * effective APR), capped at full balance. Not issuer-specific; good enough for budgeting.
 */
export function estimatedMinimumMonthlyPayment(debt: Debt, asOf: Date = new Date()): number {
	if (debt.balance <= 1e-6) return 0;
	const apr = effectiveAnnualAprPercent(debt, asOf);
	const interestApprox = debt.balance * (apr / 100) / 12;
	const principalFloor = debt.balance * MIN_PAYMENT_PERCENT_OF_BALANCE;
	const raw = Math.max(MIN_PAYMENT_ABSOLUTE_FLOOR, principalFloor + interestApprox);
	return Math.min(debt.balance, Math.round(raw * 100) / 100);
}
