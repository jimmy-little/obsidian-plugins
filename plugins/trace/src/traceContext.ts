import type { CachedMetadata, TFile } from "obsidian";
import type { ColumnMapping, LogFormat } from "./types";
import { detectFormat } from "./parser";

export function isTraceFile(file: TFile, cache: CachedMetadata | null): boolean {
	if (file.extension === "log" || file.extension === "csv") return true;
	if (file.extension === "md") {
		const fm = cache?.frontmatter;
		return fm?.trace === true || fm?.trace === "true";
	}
	return false;
}

export function resolveLogFormat(
	content: string,
	cache: CachedMetadata | null,
	extension: string,
): LogFormat {
	const fm = cache?.frontmatter;
	const hint = fm?.logformat;
	if (hint === "table" || hint === "csv" || hint === "log") return hint;
	if (extension === "csv") return "csv";
	if (extension === "log") return "log";
	return detectFormat(content, undefined);
}

export function resolveTraceColumns(cache: CachedMetadata | null): ColumnMapping | undefined {
	const raw = cache?.frontmatter?.["trace-columns"];
	if (!raw || typeof raw !== "object") return undefined;
	const o = raw as Record<string, unknown>;
	const mapping: ColumnMapping = {};
	if (typeof o.timestamp === "string") mapping.timestamp = o.timestamp;
	if (typeof o.status === "string") mapping.status = o.status;
	if (typeof o.subject === "string") mapping.subject = o.subject;
	if (typeof o.message === "string") mapping.message = o.message;
	return Object.keys(mapping).length > 0 ? mapping : undefined;
}
