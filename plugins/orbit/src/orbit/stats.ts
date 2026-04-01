import type {InteractionEntry} from "./interactions";

export type PersonStatsTiles = {
	lastContacted: number | null;
	totalInteractions: number;
	thisMonth: number;
	avgCadenceDays: number | null;
	firstContact: number | null;
	monthStreak: number;
};

function startOfMonth(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function daysBetween(a: number, b: number): number {
	return Math.round(Math.abs(a - b) / 86400000);
}

/**
 * Rolling average gap between consecutive interaction dates (oldest → newest gaps).
 */
export function computePersonStats(interactions: InteractionEntry[], nowMs: number = Date.now()): PersonStatsTiles {
	const dates = [...new Set(interactions.map((i) => i.dateMs))].sort((a, b) => a - b);
	const totalInteractions = interactions.length;

	if (dates.length === 0) {
		return {
			lastContacted: null,
			totalInteractions: 0,
			thisMonth: 0,
			avgCadenceDays: null,
			firstContact: null,
			monthStreak: 0,
		};
	}

	const lastContacted = dates[dates.length - 1];
	const firstContact = dates[0];

	const monthStart = startOfMonth(new Date(nowMs));
	const thisMonth = interactions.filter((i) => i.dateMs >= monthStart).length;

	let avgCadenceDays: number | null = null;
	if (dates.length >= 2) {
		let sum = 0;
		let n = 0;
		for (let i = 1; i < dates.length; i++) {
			sum += daysBetween(dates[i - 1], dates[i]);
			n++;
		}
		avgCadenceDays = n > 0 ? Math.round((sum / n) * 10) / 10 : null;
	}

	/** Months (year-month key) with at least one interaction, for streak */
	const monthsWith = new Set<string>();
	for (const i of interactions) {
		const d = new Date(i.dateMs);
		monthsWith.add(`${d.getFullYear()}-${d.getMonth()}`);
	}

	let monthStreak = 0;
	const cur = new Date(nowMs);
	for (;;) {
		const key = `${cur.getFullYear()}-${cur.getMonth()}`;
		if (!monthsWith.has(key)) break;
		monthStreak++;
		cur.setMonth(cur.getMonth() - 1);
		if (monthStreak > 600) break;
	}

	return {
		lastContacted,
		totalInteractions,
		thisMonth,
		avgCadenceDays,
		firstContact,
		monthStreak,
	};
}
