import type { ChiselSettings } from "./settings";

export function formatMoney(amount: number, settings: ChiselSettings): string {
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: settings.currency,
			maximumFractionDigits: 2,
			minimumFractionDigits: 2,
		}).format(amount);
	} catch {
		return amount.toFixed(2);
	}
}

export function formatApr(aprPercent: number): string {
	return `${aprPercent.toFixed(2)}%`;
}
