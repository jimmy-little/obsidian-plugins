import type { Debt } from "./types";

export function defaultPayoffDraft(debt: Debt): { primary: string; compare: string } {
	const p = Math.max(25, Math.min(debt.balance * 0.02, debt.balance));
	const rounded = Math.round(p * 100) / 100;
	return { primary: rounded.toFixed(2), compare: "" };
}
