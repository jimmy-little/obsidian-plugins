/** Optional intro / balance-transfer promo (APR until `endsOn`, inclusive calendar day). */
export type DebtPromo = {
	apr: number;
	/** Local calendar date `YYYY-MM-DD`. */
	endsOn: string;
};

export type Debt = {
	id: string;
	name: string;
	/** Current balance owed (currency units). */
	balance: number;
	/** Annual percentage rate after promo (e.g. 24.99). */
	standardApr: number;
	promo?: DebtPromo;
};

export const CHISEL_DATA_VERSION = "1";

export type ChiselPluginData = {
	version: typeof CHISEL_DATA_VERSION;
	debts: Debt[];
};
