import {RRule, rrulestr} from "rrule";
import type {RecurrenceAnchorMode} from "../types";

export type RecurrenceAdvanceAction = "complete" | "skip";

export type RecurrenceAdvanceInput = {
	recurrence: string;
	scheduledDate?: string;
	dueDate?: string;
	recurrenceAnchor?: RecurrenceAnchorMode;
	completeInstances: string[];
	skippedInstances: string[];
};

export type RecurrenceAdvanceFieldKeys = {
	status: string;
	completedDate: string;
	scheduled: string;
	due: string;
	completeInstances: string;
	skippedInstances: string;
	openStatus: string;
	doneStatus: string;
	maintainDueOffset: boolean;
};

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

function formatLocalIsoDate(d: Date): string {
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

export function isoDateOnly(iso: string | undefined | null): string | null {
	if (!iso?.trim()) return null;
	const m = iso.trim().match(ISO_DATE);
	return m?.[1] ?? null;
}

export function parseRRule(recurrence: string): RRule | null {
	const raw = recurrence.trim();
	if (!raw) return null;
	try {
		if (raw.includes("DTSTART")) {
			const normalized = normalizeDtStartRRuleString(raw);
			return rrulestr(normalized, {forceset: false}) as RRule;
		}
		return rrulestr(`RRULE:${raw}`, {forceset: false}) as RRule;
	} catch {
		try {
			return rrulestr(raw) as RRule;
		} catch {
			return null;
		}
	}
}

/** Fulcrum stores DTSTART and RRULE segments semicolon-separated; rrule needs iCal layout. */
function normalizeDtStartRRuleString(raw: string): string {
	if (raw.includes("\n") && raw.includes("RRULE:")) return raw;

	const segments = raw.split(";").filter(Boolean);
	let dtstart: string | undefined;
	const rruleParts: string[] = [];

	for (const seg of segments) {
		if (seg.startsWith("DTSTART:")) {
			dtstart = seg.slice("DTSTART:".length);
		} else if (seg.startsWith("DTSTART")) {
			dtstart = seg.slice("DTSTART".length).replace(/^:/, "");
		} else {
			rruleParts.push(seg);
		}
	}

	if (!dtstart || rruleParts.length === 0) return raw;

	const dtNorm = /^\d{8}$/.test(dtstart) ? `${dtstart}T120000` : dtstart;
	return `DTSTART:${dtNorm}\nRRULE:${rruleParts.join(";")}`;
}

/** Next N upcoming occurrence dates (YYYY-MM-DD), from today forward. */
export function computeNextOccurrences(
	recurrence: string,
	scheduledDate: string | undefined,
	completeInstances: string[],
	skippedInstances: string[],
	count = 3,
): string[] {
	const rule = parseRRule(recurrence);
	if (!rule) return [];

	const today = formatLocalIsoDate(new Date());
	const sched = isoDateOnly(scheduledDate) ?? today;
	const result: string[] = [];

	// Search from the day before max(today, scheduled) so the first match can be today or later.
	const anchor = sched > today ? sched : today;
	let cursor = new Date(anchor + "T00:00:00");
	cursor.setDate(cursor.getDate() - 1);

	while (result.length < count) {
		const next = nextOccurrenceAfter(recurrence, cursor, completeInstances, skippedInstances);
		if (!next) break;
		const key = formatLocalIsoDate(next);
		if (!result.includes(key)) result.push(key);
		cursor = new Date(next.getTime() + 60_000);
	}

	return result.slice(0, count);
}

export function nextOccurrenceAfter(
	recurrence: string,
	after: Date,
	completeInstances: string[],
	skippedInstances: string[],
): Date | null {
	const rule = parseRRule(recurrence);
	if (!rule) return null;
	const completed = new Set(completeInstances.map(isoDateOnly).filter(Boolean) as string[]);
	const skipped = new Set(skippedInstances.map(isoDateOnly).filter(Boolean) as string[]);
	let cursor = new Date(after.getTime());
	for (let i = 0; i < 366; i++) {
		const next = rule.after(cursor, false);
		if (!next) return null;
		const key = formatLocalIsoDate(next);
		if (!completed.has(key) && !skipped.has(key)) return next;
		cursor = new Date(next.getTime() + 60_000);
	}
	return null;
}

export function formatOccurrenceIso(d: Date, template?: string | null): string {
	if (template?.includes("T")) {
		const tMatch = template.match(/T(\d{2}:\d{2})/);
		if (tMatch?.[1]) {
			const [h, m] = tMatch[1].split(":").map(Number);
			const local = new Date(d);
			local.setHours(h ?? 9, m ?? 0, 0, 0);
			const y = local.getFullYear();
			const mo = String(local.getMonth() + 1).padStart(2, "0");
			const day = String(local.getDate()).padStart(2, "0");
			const hh = String(local.getHours()).padStart(2, "0");
			const mm = String(local.getMinutes()).padStart(2, "0");
			return `${y}-${mo}-${day}T${hh}:${mm}`;
		}
	}
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

export function daysBetween(a: string | undefined, b: string | undefined): number | null {
	const da = isoDateOnly(a);
	const db = isoDateOnly(b);
	if (!da || !db) return null;
	const t1 = Date.parse(da + "T12:00:00");
	const t2 = Date.parse(db + "T12:00:00");
	if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
	return Math.round((t2 - t1) / 86_400_000);
}

export function addDaysToIso(iso: string, days: number): string {
	const d = isoDateOnly(iso) ?? iso.slice(0, 10);
	const t = Date.parse(d + "T12:00:00");
	if (Number.isNaN(t)) return iso;
	const next = new Date(t + days * 86_400_000);
	return formatOccurrenceIso(next);
}

export function completionDateForTask(
	scheduledDate: string | undefined,
	anchor: RecurrenceAnchorMode | undefined,
): string {
	if (anchor === "done") {
		return new Date().toISOString().slice(0, 10);
	}
	return isoDateOnly(scheduledDate) ?? new Date().toISOString().slice(0, 10);
}

export function computeNextScheduledAfterComplete(
	recurrence: string,
	currentScheduled: string | undefined,
	completedOn: string,
	completeInstances: string[],
	skippedInstances: string[],
	anchor: RecurrenceAnchorMode | undefined,
): string | null {
	const afterBase =
		anchor === "done"
			? new Date(completedOn + "T23:59:59")
			: currentScheduled
				? new Date((currentScheduled.includes("T") ? currentScheduled : completedOn + "T12:00:00"))
				: new Date(completedOn + "T12:00:00");
	const next = nextOccurrenceAfter(recurrence, afterBase, completeInstances, skippedInstances);
	if (!next) return null;
	return formatOccurrenceIso(next, currentScheduled);
}

/** Preset RRULE strings with DTSTART from today. */
export function presetRecurrence(preset: "daily" | "weekly" | "monthly", startIso?: string): string {
	const start = startIso?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
	const dt = start.replace(/-/g, "");
	switch (preset) {
		case "daily":
			return `DTSTART:${dt};FREQ=DAILY`;
		case "weekly":
			return `DTSTART:${dt};FREQ=WEEKLY`;
		case "monthly":
			return `DTSTART:${dt};FREQ=MONTHLY`;
	}
}

/** Frontmatter patch for completing or skipping one recurring occurrence. */
export function buildRecurringOccurrenceAdvancePatch(
	occurrenceDate: string,
	input: RecurrenceAdvanceInput,
	keys: RecurrenceAdvanceFieldKeys,
	action: RecurrenceAdvanceAction,
): Record<string, unknown> {
	const completeInstances = [...input.completeInstances];
	const skippedInstances = [...input.skippedInstances];

	if (action === "complete") {
		if (!completeInstances.includes(occurrenceDate)) completeInstances.push(occurrenceDate);
	} else if (!skippedInstances.includes(occurrenceDate)) {
		skippedInstances.push(occurrenceDate);
	}

	const nextSched = computeNextScheduledAfterComplete(
		input.recurrence,
		input.scheduledDate,
		occurrenceDate,
		completeInstances,
		skippedInstances,
		input.recurrenceAnchor,
	);

	const patch: Record<string, unknown> = {
		[keys.status]: keys.openStatus,
		[keys.completedDate]: null,
		[keys.completeInstances]: completeInstances,
		[keys.skippedInstances]: skippedInstances.length > 0 ? skippedInstances : null,
	};

	if (nextSched) {
		patch[keys.scheduled] = nextSched;
		if (keys.maintainDueOffset && input.dueDate && input.scheduledDate) {
			const offset = daysBetween(input.scheduledDate, input.dueDate);
			if (offset != null) {
				patch[keys.due] = addDaysToIso(nextSched, offset);
			}
		} else {
			patch[keys.due] = nextSched;
		}
	} else {
		patch[keys.status] = keys.doneStatus;
		patch[keys.completedDate] = occurrenceDate;
	}

	return patch;
}
