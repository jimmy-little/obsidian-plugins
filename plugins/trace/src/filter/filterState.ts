import type { StatusCategory, LogEntry } from "../types";

export interface FilterState {
	dateFrom: string;
	dateTo: string;
	statusCategories: Set<StatusCategory>;
	keyword: string;
}

export const ALL_STATUS_CATEGORIES: StatusCategory[] = [
	"success",
	"error",
	"warning",
	"info",
	"neutral",
];

export function defaultFilterState(): FilterState {
	return {
		dateFrom: "",
		dateTo: "",
		statusCategories: new Set(ALL_STATUS_CATEGORIES),
		keyword: "",
	};
}

function entryMatchesKeyword(entry: LogEntry, keyword: string): boolean {
	if (!keyword.trim()) return true;
	const needle = keyword.trim().toLowerCase();
	const parts = [
		entry.timestamp?.toISOString() ?? "",
		entry.status ?? "",
		entry.subject ?? "",
		entry.message ?? "",
		entry.raw,
	];
	return parts.some((p) => p.toLowerCase().includes(needle));
}

function entryMatchesDate(entry: LogEntry, from: string, to: string): boolean {
	if (!from && !to) return true;
	if (!entry.timestamp) return !from && !to;
	const t = entry.timestamp.getTime();
	if (from) {
		const fromDate = new Date(from);
		fromDate.setHours(0, 0, 0, 0);
		if (t < fromDate.getTime()) return false;
	}
	if (to) {
		const toDate = new Date(to);
		toDate.setHours(23, 59, 59, 999);
		if (t > toDate.getTime()) return false;
	}
	return true;
}

export function filterEntries(entries: LogEntry[], state: FilterState): LogEntry[] {
	return entries.filter((entry) => {
		if (!state.statusCategories.has(entry.statusCategory)) return false;
		if (!entryMatchesDate(entry, state.dateFrom, state.dateTo)) return false;
		if (!entryMatchesKeyword(entry, state.keyword)) return false;
		return true;
	});
}

export function visibleLineNumbers(entries: LogEntry[], state: FilterState): Set<number> {
	return new Set(filterEntries(entries, state).map((e) => e.lineNumber));
}
