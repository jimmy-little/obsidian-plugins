import type {TimerSettings} from "../../timer/settings";
import {readTimerEntriesFromFm, timeEntryDateSpan} from "./timerEntries";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateOnly(raw: string | undefined): string | null {
	if (!raw?.trim()) return null;
	const norm = raw.trim().slice(0, 10);
	if (!ISO_DATE.test(norm)) return null;
	if (Number.isNaN(Date.parse(`${norm}T12:00:00`))) return null;
	return norm;
}

function fmString(fm: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!fm || !key) return undefined;
	const v = fm[key];
	if (v == null) return undefined;
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

/** Primary gantt date + optional span from timeEntries on the task note. */
export function resolveTaskTimelineFields(
	fm: Record<string, unknown> | undefined,
	timer: TimerSettings,
	filePath: string,
	scheduled?: string,
	due?: string,
): {ganttDate?: string; ganttTimeEntrySpan?: {startIso: string; endIso: string}} {
	const dateRaw = fmString(fm, "date") || scheduled || due;
	const ganttDate = parseIsoDateOnly(dateRaw) ?? undefined;
	const span = timeEntryDateSpan(readTimerEntriesFromFm(fm, timer, filePath));
	return {
		ganttDate,
		ganttTimeEntrySpan: span ?? undefined,
	};
}
