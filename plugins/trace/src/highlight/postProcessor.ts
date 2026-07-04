import { TFile } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type TracePlugin from "../main";
import { detectAndParse } from "../parser";
import { buildAliasMap, resolveColumnIndices } from "../parser/columnMapping";
import { cellClassForField } from "./tokenTypes";
import { isTraceFile, resolveLogFormat, resolveTraceColumns } from "../traceContext";
import type { LogEntry } from "../types";

function applyTableHighlighting(
	table: HTMLTableElement,
	entries: LogEntry[],
	settings: TracePlugin["settings"],
): void {
	const headerRow = table.querySelector("thead tr") ?? table.querySelector("tr");
	if (!headerRow) return;
	const headers = Array.from(headerRow.querySelectorAll("th, td")).map((c) => c.textContent?.trim() ?? "");
	const aliasMap = buildAliasMap(settings);
	const colIndices = resolveColumnIndices(headers, aliasMap);
	const fieldByCol: Array<"timestamp" | "status" | "subject" | "message" | null> = headers.map((_, i) => {
		if (colIndices.timestamp === i) return "timestamp";
		if (colIndices.status === i) return "status";
		if (colIndices.subject === i) return "subject";
		if (colIndices.message === i) return "message";
		return null;
	});

	const bodyRows = table.querySelectorAll("tbody tr");
	const rows = bodyRows.length > 0 ? Array.from(bodyRows) : Array.from(table.querySelectorAll("tr")).slice(1);

	rows.forEach((tr, rowIdx) => {
		tr.setAttribute("data-trace-line", String(entries[rowIdx]?.lineNumber ?? rowIdx + 2));
		const entry = entries[rowIdx];
		tr.querySelectorAll("td").forEach((td, colIdx) => {
			const field = fieldByCol[colIdx];
			if (!field) return;
			const cls = cellClassForField(field, field === "status" ? entry?.statusCategory : undefined);
			td.classList.add(...cls.split(" "));
		});
	});
}

function applyLogLineHighlighting(container: HTMLElement, entries: LogEntry[]): void {
	const pres = container.querySelectorAll("pre, p, li");
	let entryIdx = 0;
	for (const el of pres) {
		if (!(el instanceof HTMLElement)) continue;
		const text = el.textContent?.trim();
		if (!text) continue;
		const entry = entries[entryIdx];
		if (!entry) break;
		el.setAttribute("data-trace-line", String(entry.lineNumber));
		el.classList.add("trace-log-line");
		if (entry.statusCategory) el.classList.add(`trace-line-status-${entry.statusCategory}`);
		entryIdx++;
	}
}

export function tracePostProcessor(plugin: TracePlugin) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const cache = plugin.app.metadataCache.getFileCache(file);
		if (!isTraceFile(file, cache)) return;
		if (el.classList.contains("trace-processed")) return;
		el.classList.add("trace-processed");

		const sourceEl = el.closest(".markdown-preview-view") ?? el;
		plugin.app.vault.read(file).then((content) => {
			const format = resolveLogFormat(content, cache, file.extension);
			const parsed = detectAndParse(
				content,
				{
					format,
					columnMapping: resolveTraceColumns(cache),
					csvDelimiter: plugin.settings.csvDelimiter,
					customStatusMappings: plugin.settings.customStatusMappings,
				},
				plugin.settings,
			);

			plugin.setContainerEntries(sourceEl as HTMLElement, parsed.entries);

			if (parsed.format === "table") {
				el.querySelectorAll("table").forEach((table) => {
					applyTableHighlighting(table as HTMLTableElement, parsed.entries, plugin.settings);
				});
			} else {
				applyLogLineHighlighting(el, parsed.entries);
			}

			plugin.mountFilterForElement(sourceEl as HTMLElement, parsed.entries, file.path);
		}).catch(console.error);
	};
}
