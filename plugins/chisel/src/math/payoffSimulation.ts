import type { Debt } from "../types";

const BALANCE_EPS = 1e-6;
const MAX_CALENDAR_DAYS = 365 * 40 + 366;

/** Local calendar key for comparisons (promo end, payment anniversaries). */
export function dateKeyLocal(d: Date): string {
	const y = d.getFullYear();
	const mo = d.getMonth() + 1;
	const day = d.getDate();
	return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function startOfLocalDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Nth monthly payment anniversary from `start` (same day-of-month; clamp to last day of month).
 * `monthIndex` 1 = one month after start.
 */
export function paymentAnniversaryDate(start: Date, monthIndex: number): Date {
	const y = start.getFullYear();
	const m = start.getMonth();
	const day = start.getDate();
	const targetMonthStart = new Date(y, m + monthIndex, 1);
	const lastDay = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth() + 1, 0).getDate();
	const clampedDay = Math.min(day, lastDay);
	return new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth(), clampedDay);
}

/** Promo APR applies on `day` when `dateKeyLocal(day) <= promo.endsOn`. */
export function effectiveAnnualAprPercent(debt: Debt, day: Date): number {
	if (debt.promo) {
		const k = dateKeyLocal(day);
		if (k <= debt.promo.endsOn) return debt.promo.apr;
	}
	return debt.standardApr;
}

export type PayoffMonthRow = {
	monthIndex: number;
	paymentDate: string;
	payment: number;
	interestThisPeriod: number;
	principalPortion: number;
	balanceAfter: number;
};

export type PayoffResult = {
	rows: PayoffMonthRow[];
	totalInterest: number;
	totalPaid: number;
	monthsToPayoff: number | null;
	paidOff: boolean;
};

export type SimulatePayoffParams = {
	debt: Debt;
	monthlyPayment: number;
	/** Simulation anchor; defaults to local today. */
	startDate?: Date;
};

/**
 * Daily compounding: each day `balance *= 1 + APR/365` using calendar-day effective APR
 * (promo may flip mid-month). Fixed payment on each monthly anniversary of `startDate`
 * (after that day’s accrual). Documented order: accrue through the day, then apply payment if due.
 */
export function simulatePayoff(params: SimulatePayoffParams): PayoffResult {
	const { debt, monthlyPayment } = params;
	const startDate = startOfLocalDay(params.startDate ?? new Date());
	let balance = Math.max(0, debt.balance);
	const rows: PayoffMonthRow[] = [];
	let totalInterest = 0;
	let totalPaid = 0;

	if (monthlyPayment <= 0 || !Number.isFinite(monthlyPayment)) {
		return {
			rows: [],
			totalInterest: 0,
			totalPaid: 0,
			monthsToPayoff: null,
			paidOff: false,
		};
	}

	if (balance <= BALANCE_EPS) {
		return {
			rows: [],
			totalInterest: 0,
			totalPaid: 0,
			monthsToPayoff: 0,
			paidOff: true,
		};
	}

	const day = new Date(startDate.getTime());
	let nextPaymentIndex = 1;
	let nextPayKey = dateKeyLocal(paymentAnniversaryDate(startDate, nextPaymentIndex));
	let periodInterest = 0;
	let dayCount = 0;

	while (balance > BALANCE_EPS && dayCount < MAX_CALENDAR_DAYS) {
		const apr = effectiveAnnualAprPercent(debt, day);
		const daily = balance * (apr / 100) / 365;
		balance += daily;
		totalInterest += daily;
		periodInterest += daily;

		const key = dateKeyLocal(day);
		if (key === nextPayKey) {
			const paymentApplied = Math.min(monthlyPayment, balance);
			balance -= paymentApplied;
			totalPaid += paymentApplied;

			const principalPortion = paymentApplied - periodInterest;

			rows.push({
				monthIndex: nextPaymentIndex,
				paymentDate: key,
				payment: paymentApplied,
				interestThisPeriod: periodInterest,
				principalPortion,
				balanceAfter: Math.max(0, balance),
			});

			periodInterest = 0;
			nextPaymentIndex += 1;
			nextPayKey = dateKeyLocal(paymentAnniversaryDate(startDate, nextPaymentIndex));

			if (balance <= BALANCE_EPS) {
				return {
					rows,
					totalInterest,
					totalPaid,
					monthsToPayoff: rows.length,
					paidOff: true,
				};
			}
		}

		day.setDate(day.getDate() + 1);
		dayCount += 1;
	}

	return {
		rows,
		totalInterest,
		totalPaid,
		monthsToPayoff: null,
		paidOff: false,
	};
}
