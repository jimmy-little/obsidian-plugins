import {localDateIsoFromDate} from "./dateTimeParse";

/** Local calendar date + minutes from an ISO timestamp (honors `Z` / offsets). */
export function localDateAndStartMinutes(iso: string): {
	dateIso: string;
	startMinutes: number | null;
} {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) {
		return {dateIso: iso.slice(0, 10), startMinutes: null};
	}
	return {
		dateIso: localDateIsoFromDate(d),
		startMinutes: d.getHours() * 60 + d.getMinutes(),
	};
}

/** True when a timed occurrence has already ended (all-day today stays current). */
export function occurrenceIsPast(
	dateIso: string,
	startMinutes: number | null,
	durationMinutes: number | null,
	now?: Date,
): boolean {
	const at = now ?? new Date();
	const today = localDateIsoFromDate(at);
	if (!dateIso || dateIso < today) return true;
	if (dateIso > today) return false;
	if (startMinutes == null) return false;
	const endMinutes = startMinutes + Math.max(0, durationMinutes ?? 0);
	const nowMinutes = at.getHours() * 60 + at.getMinutes();
	return nowMinutes >= endMinutes && nowMinutes >= startMinutes;
}

export const WORLD_CLOCK_DAY_START_HOUR = 7;
export const WORLD_CLOCK_DAY_END_HOUR = 19;

export type WorldClockZone = {
	label: string;
	/** IANA zone; empty/null = local. */
	timeZone: string | null;
};

export function parseWorldClockSettings(raw: string): WorldClockZone[] {
	const rows = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((part) => {
			const pipe = part.indexOf("|");
			if (pipe < 0) return {label: part, timeZone: null};
			const label = part.slice(0, pipe).trim();
			const timeZone = part.slice(pipe + 1).trim();
			return {label: label || timeZone || "Local", timeZone: timeZone || null};
		});
	return rows.length > 0 ? rows : [
		{label: "HOME", timeZone: null},
	];
}

export function hourInTimeZone(now: Date, timeZone: string | null): number {
	if (!timeZone) return now.getHours();
	try {
		const hourRaw = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "numeric",
			hourCycle: "h23",
		}).format(now);
		const hour = Number.parseInt(hourRaw, 10);
		return Number.isFinite(hour) ? hour : now.getHours();
	} catch {
		return now.getHours();
	}
}

export function isDaytimeInTimeZone(
	now: Date,
	timeZone: string | null,
	dayStartHour = WORLD_CLOCK_DAY_START_HOUR,
	dayEndHour = WORLD_CLOCK_DAY_END_HOUR,
): boolean {
	const hour = hourInTimeZone(now, timeZone);
	return hour >= dayStartHour && hour < dayEndHour;
}

export function formatClockTimeInZone(now: Date, timeZone: string | null): string {
	try {
		return new Intl.DateTimeFormat(undefined, {
			timeZone: timeZone ?? undefined,
			hour: "numeric",
			minute: "2-digit",
		}).format(now);
	} catch {
		return new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"}).format(now);
	}
}
