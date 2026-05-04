import type { Debt } from "./types";

/**
 * Collapses duplicate `id` entries (bad data or import glitches). Balances are summed;
 * first row wins for name, `standardApr`, and optional `promo`.
 */
export function dedupeDebtsById(debts: Debt[]): Debt[] {
	const m = new Map<string, Debt>();
	for (const d of debts) {
		const ex = m.get(d.id);
		if (!ex) {
			m.set(d.id, { ...d });
		} else {
			m.set(d.id, {
				...ex,
				balance: ex.balance + d.balance,
				promo: ex.promo ?? d.promo,
			});
		}
	}
	return [...m.values()];
}
