import type { OpenViewsIn } from "@obsidian-suite/core";

export type ChiselSettings = {
	/** ISO 4217 for `Intl.NumberFormat` (e.g. USD). */
	currency: string;
	openViewsIn: OpenViewsIn;
};

export const DEFAULT_SETTINGS: ChiselSettings = {
	currency: "USD",
	openViewsIn: "sidebar",
};
