import type { LogEntry, ParseOptions } from "../types";
import { buildAliasMap, resolveColumnIndices } from "./columnMapping";
import { normalizeStatus } from "./statusNormalizer";
import { parseTimestamp } from "./timestampParser";
import type { TraceSettings } from "../types";

function splitTableRow(line: string): string[] {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|")) return [];
	const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
	return inner.split("|").map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")));
}

function buildEntry(
	cells: string[],
	cols: Record<"timestamp" | "status" | "subject" | "message", number | null>,
	raw: string,
	lineNumber: number,
	customMappings: Record<string, import("../types").StatusCategory>,
): LogEntry {
	const get = (idx: number | null) => (idx !== null && idx < cells.length ? cells[idx] : null);
	const statusRaw = get(cols.status);
	const statusStr = statusRaw?.trim() || null;
	return {
		timestamp: parseTimestamp(get(cols.timestamp)),
		status: statusStr,
		statusCategory: normalizeStatus(statusStr, customMappings),
		subject: get(cols.subject)?.trim() || null,
		message: get(cols.message)?.trim() || null,
		raw,
		lineNumber,
	};
}

export function parseTable(
	content: string,
	options: ParseOptions,
	settings?: TraceSettings,
): LogEntry[] {
	const lines = content.split("\n");
	const aliasMap = settings ? buildAliasMap(settings) : undefined;
	const entries: LogEntry[] = [];
	let headers: string[] | null = null;
	let colIndices: ReturnType<typeof resolveColumnIndices> | null = null;
	const custom = options.customStatusMappings ?? {};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const cells = splitTableRow(line);
		if (cells.length === 0) continue;
		if (isSeparatorRow(cells)) continue;

		if (!headers) {
			headers = cells;
			if (aliasMap) {
				colIndices = resolveColumnIndices(headers, aliasMap, options.columnMapping);
			} else {
				colIndices = resolveColumnIndices(headers, {
					timestamp: ["date", "time", "timestamp"],
					status: ["status", "level"],
					subject: ["app", "source"],
					message: ["message", "note"],
				}, options.columnMapping);
			}
			continue;
		}

		if (!colIndices) continue;
		entries.push(buildEntry(cells, colIndices, line, i + 1, custom));
	}

	return entries;
}
