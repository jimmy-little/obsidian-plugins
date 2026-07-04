import type { LogEntry, ParseOptions } from "../types";
import { buildAliasMap, resolveColumnIndices } from "./columnMapping";
import { parseCsvLine } from "./csvParser";
import { normalizeStatus } from "./statusNormalizer";
import { parseTimestamp } from "./timestampParser";
import type { TraceSettings } from "../types";

export function parseCsv(
	content: string,
	options: ParseOptions,
	settings?: TraceSettings,
): LogEntry[] {
	const delimiter = options.csvDelimiter ?? ",";
	const lines = content.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length === 0) return [];

	const headers = parseCsvLine(lines[0], delimiter);
	const aliasMap = settings
		? buildAliasMap(settings)
		: {
				timestamp: ["date", "time", "timestamp"],
				status: ["status", "level"],
				subject: ["app", "source"],
				message: ["message", "note"],
			};
	const colIndices = resolveColumnIndices(headers, aliasMap, options.columnMapping);
	const custom = options.customStatusMappings ?? {};
	const entries: LogEntry[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		const cells = parseCsvLine(line, delimiter);
		const get = (idx: number | null) => (idx !== null && idx < cells.length ? cells[idx] : null);
		const statusRaw = get(colIndices.status);
		const statusStr = statusRaw?.trim() || null;
		entries.push({
			timestamp: parseTimestamp(get(colIndices.timestamp)),
			status: statusStr,
			statusCategory: normalizeStatus(statusStr, custom),
			subject: get(colIndices.subject)?.trim() || null,
			message: get(colIndices.message)?.trim() || null,
			raw: line,
			lineNumber: i + 1,
		});
	}

	return entries;
}
