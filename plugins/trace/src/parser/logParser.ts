import type { LogEntry, ParseOptions } from "../types";
import { normalizeStatus } from "./statusNormalizer";
import { parseTimestamp } from "./timestampParser";

const STATUS_PREFIX = /^(ERROR|WARN|WARNING|INFO|DEBUG|LOG|TRACE|NOTICE|FAIL|FAILED|OPEN|CLOSED|SUCCESS|OK)\s*:\s+(.*)$/i;

function isLikelyStatus(token: string): boolean {
	return normalizeStatus(token) !== "neutral";
}

function matchBracketTimestamp(line: string): { timestamp: string; status: string; message: string } | null {
	const m = line.match(/^\[([^\]]+)\]\s+(\S+)\s+(.*)$/);
	if (!m) return null;
	return { timestamp: m[1], status: m[2], message: m[3] };
}

function matchSpacedTimestamp(line: string): { timestamp: string; status: string; message: string } | null {
	const m = line.match(/^(\S+)\s+(\S+)\s+(.*)$/);
	if (!m) return null;
	const ts = parseTimestamp(m[1]);
	if (!ts && !isLikelyStatus(m[2])) return null;
	return { timestamp: m[1], status: m[2], message: m[3] };
}

function matchLevelPrefix(line: string): { status: string; message: string } | null {
	const m = line.match(STATUS_PREFIX);
	if (!m) return null;
	return { status: m[1], message: m[2] };
}

export function parseLogLines(content: string, options: ParseOptions): LogEntry[] {
	const custom = options.customStatusMappings ?? {};
	const lines = content.split("\n");
	const entries: LogEntry[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) continue;

		const bracket = matchBracketTimestamp(line);
		const spaced = bracket ? null : matchSpacedTimestamp(line);
		const level = bracket || spaced ? null : matchLevelPrefix(line);

		if (bracket) {
			const statusStr = bracket.status.trim();
			entries.push({
				timestamp: parseTimestamp(bracket.timestamp),
				status: statusStr,
				statusCategory: normalizeStatus(statusStr, custom),
				subject: null,
				message: bracket.message.trim() || null,
				raw: line,
				lineNumber: i + 1,
			});
			continue;
		}

		if (spaced) {
			const statusStr = spaced.status.trim();
			entries.push({
				timestamp: parseTimestamp(spaced.timestamp),
				status: statusStr,
				statusCategory: normalizeStatus(statusStr, custom),
				subject: null,
				message: spaced.message.trim() || null,
				raw: line,
				lineNumber: i + 1,
			});
			continue;
		}

		if (level) {
			const statusStr = level.status.trim();
			entries.push({
				timestamp: null,
				status: statusStr,
				statusCategory: normalizeStatus(statusStr, custom),
				subject: null,
				message: level.message.trim() || null,
				raw: line,
				lineNumber: i + 1,
			});
			continue;
		}

		entries.push({
			timestamp: null,
			status: null,
			statusCategory: "neutral",
			subject: null,
			message: line.trim(),
			raw: line,
			lineNumber: i + 1,
		});
	}

	return entries;
}
