import type { LogEntry, LogFormat } from "../types";
import { buildAliasMap, resolveColumnIndices } from "../parser/columnMapping";
import { splitTableRow } from "./tableRowUtils";
import { tokenClassForField } from "./tokenTypes";
import type { TraceSettings } from "../types";

function isSeparatorRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")));
}

export interface LineDecoration {
	from: number;
	to: number;
	className: string;
}

function pushLineDecoration(
	decorations: LineDecoration[],
	lineOffset: number,
	start: number,
	end: number,
	className: string,
): void {
	if (end <= start || !className.trim()) return;
	decorations.push({ from: lineOffset + start, to: lineOffset + end, className });
}

export function decorationsForTableLine(
	line: string,
	lineOffset: number,
	format: LogFormat,
	headers: string[] | null,
	colIndices: ReturnType<typeof resolveColumnIndices> | null,
	entry: LogEntry | null,
	settings?: TraceSettings,
): { decorations: LineDecoration[]; headers: string[] | null; colIndices: ReturnType<typeof resolveColumnIndices> | null } {
	const decorations: LineDecoration[] = [];
	if (format !== "table") return { decorations, headers, colIndices };

	const cells = splitTableRow(line);
	if (cells.length === 0) return { decorations, headers, colIndices };
	if (isSeparatorRow(cells)) return { decorations, headers, colIndices };

	let nextHeaders = headers;
	let nextIndices = colIndices;

	if (!headers) {
		nextHeaders = cells;
		const aliasMap = settings ? buildAliasMap(settings) : {
			timestamp: ["date", "time"],
			status: ["status", "level"],
			subject: ["app", "source"],
			message: ["message", "note"],
		};
		nextIndices = resolveColumnIndices(cells, aliasMap);
		return { decorations, headers: nextHeaders, colIndices: nextIndices };
	}

	if (!nextIndices || !entry) return { decorations, headers: nextHeaders, colIndices: nextIndices };

	let pos = line.indexOf("|");
	if (pos < 0) return { decorations, headers: nextHeaders, colIndices: nextIndices };
	pos += 1;

	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i];
		if (!cell.length) continue;
		const cellStart = line.indexOf(cell, pos);
		if (cellStart < 0) continue;
		const cellEnd = cellStart + cell.length;
		if (cellEnd <= cellStart) continue;
		pos = cellEnd;

		let field: "timestamp" | "status" | "subject" | "message" | null = null;
		if (nextIndices.timestamp === i) field = "timestamp";
		else if (nextIndices.status === i) field = "status";
		else if (nextIndices.subject === i) field = "subject";
		else if (nextIndices.message === i) field = "message";

		if (field) {
			decorations.push({
				from: lineOffset + cellStart,
				to: lineOffset + cellEnd,
				className: tokenClassForField(field, field === "status" ? entry.statusCategory : undefined),
			});
		}
	}

	return { decorations, headers: nextHeaders, colIndices: nextIndices };
}

export function decorationsForLogLine(line: string, lineOffset: number, entry: LogEntry): LineDecoration[] {
	const decorations: LineDecoration[] = [];
	const raw = entry.raw;

	if (entry.timestamp) {
		const tsStr = entry.timestamp.toISOString();
		const idx = raw.indexOf(tsStr.slice(0, 19));
		if (idx >= 0) {
			pushLineDecoration(decorations, lineOffset, idx, idx + tsStr.slice(0, 19).length, tokenClassForField("timestamp"));
		} else {
			const bracket = raw.match(/\[([^\]]+)\]/);
			if (bracket && bracket.index !== undefined && bracket[0].length > 0) {
				pushLineDecoration(
					decorations,
					lineOffset,
					bracket.index,
					bracket.index + bracket[0].length,
					tokenClassForField("timestamp"),
				);
			}
		}
	}

	if (entry.status) {
		const statusIdx = raw.search(new RegExp(`\\b${escapeRegex(entry.status)}\\b`));
		if (statusIdx >= 0 && entry.status.length > 0) {
			pushLineDecoration(
				decorations,
				lineOffset,
				statusIdx,
				statusIdx + entry.status.length,
				tokenClassForField("status", entry.statusCategory),
			);
		}
	}

	if (entry.message && entry.status) {
		const msgIdx = raw.lastIndexOf(entry.message);
		if (msgIdx >= 0 && entry.message.length > 0) {
			pushLineDecoration(
				decorations,
				lineOffset,
				msgIdx,
				msgIdx + entry.message.length,
				tokenClassForField("message"),
			);
		}
	} else if (entry.message && !entry.status && line.length > 0) {
		pushLineDecoration(decorations, lineOffset, 0, line.length, tokenClassForField("comment"));
	}

	return decorations;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { splitTableRow };