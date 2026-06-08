import {RRule, rrulestr} from "rrule";
import type {RecurrenceAnchorMode} from "../types";

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

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
			return rrulestr(raw, {forceset: false}) as RRule;
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
		const key = isoDateOnly(next.toISOString()) ?? next.toISOString().slice(0, 10);
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
