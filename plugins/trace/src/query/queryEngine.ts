import type { LogEntry, StatusCategory } from "../types";
import { ALL_STATUS_CATEGORIES, filterEntries, defaultFilterState } from "../filter/filterState";
export interface TraceQueryParams {
	source: string;
	status?: string[];
	dateFrom?: string;
	dateTo?: string;
	keyword?: string;
	limit?: number;
	groupBy?: "status" | "date";
	display?: "table" | "summary";
}

export function parseTraceBlockSource(source: string): TraceQueryParams | null {
	const params: Record<string, string> = {};
	for (const line of source.split("\n")) {
		const m = line.match(/^\s*([a-z-]+)\s*:\s*(.+)$/i);
		if (!m) continue;
		params[m[1].trim().toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, "");
	}
	if (!params.source) return null;

	const result: TraceQueryParams = { source: params.source };
	if (params.status) {
		result.status = params.status.split(",").map((s) => s.trim()).filter(Boolean);
	}
	if (params["date-from"]) result.dateFrom = params["date-from"];
	if (params["date-to"]) result.dateTo = params["date-to"];
	if (params.keyword) result.keyword = params.keyword;
	if (params.limit) {
		const n = parseInt(params.limit, 10);
		if (!Number.isNaN(n) && n > 0) result.limit = n;
	}
	if (params["group-by"] === "status" || params["group-by"] === "date") {
		result.groupBy = params["group-by"];
	}
	if (params.display === "table" || params.display === "summary") {
		result.display = params.display;
	}

	return result;
}

function matchesStatusFilter(entry: LogEntry, statuses: string[]): boolean {
	if (statuses.length === 0) return true;
	for (const s of statuses) {
		const lower = s.toLowerCase();
		if (ALL_STATUS_CATEGORIES.includes(lower as StatusCategory) && entry.statusCategory === lower) {
			return true;
		}
		if (entry.status && entry.status.toLowerCase() === lower) return true;
		if (entry.status && entry.status.toUpperCase() === s.toUpperCase()) return true;
	}
	return false;
}

export function queryEntries(
	entries: LogEntry[],
	params: TraceQueryParams,
	defaultLimit: number,
): LogEntry[] {
	const state = defaultFilterState();
	if (params.dateFrom) state.dateFrom = params.dateFrom;
	if (params.dateTo) state.dateTo = params.dateTo;
	if (params.keyword) state.keyword = params.keyword;

	let filtered = filterEntries(entries, state);
	if (params.status?.length) {
		filtered = filtered.filter((e) => matchesStatusFilter(e, params.status!));
	}

	const limit = params.limit ?? defaultLimit;
	return filtered.slice(0, limit);
}

export interface SummaryGroup {
	key: string;
	count: number;
}

export function groupEntries(entries: LogEntry[], groupBy: "status" | "date"): SummaryGroup[] {
	const counts = new Map<string, number>();
	for (const e of entries) {
		let key: string;
		if (groupBy === "date") {
			key = e.timestamp
				? `${e.timestamp.getFullYear()}-${String(e.timestamp.getMonth() + 1).padStart(2, "0")}-${String(e.timestamp.getDate()).padStart(2, "0")}`
				: "unknown";
		} else {
			key = e.status ?? "unknown";
		}
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.map(([key, count]) => ({ key, count }))
		.sort((a, b) => b.count - a.count);
}
