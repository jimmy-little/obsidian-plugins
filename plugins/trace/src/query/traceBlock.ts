import { normalizePath, TFile } from "obsidian";
import type TracePlugin from "../main";
import { detectAndParse } from "../parser";
import { cellClassForField } from "../highlight/tokenTypes";
import { groupEntries, parseTraceBlockSource, queryEntries } from "./queryEngine";
import { resolveLogFormat, resolveTraceColumns } from "../traceContext";
import type { LogEntry } from "../types";

function renderError(el: HTMLElement, message: string): void {
	el.empty();
	const span = el.createSpan({ cls: "trace-block-error" });
	span.setText(`⚠ Trace: ${message}`);
}

function renderTable(el: HTMLElement, entries: LogEntry[]): void {
	el.empty();
	if (entries.length === 0) {
		el.createSpan({ text: "No entries matched your query.", cls: "trace-block-empty" });
		return;
	}

	const table = el.createEl("table", { cls: "trace-query-table" });
	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	for (const h of ["Date", "Status", "Subject", "Message"]) {
		headerRow.createEl("th", { text: h });
	}
	const tbody = table.createEl("tbody");
	for (const entry of entries) {
		const tr = tbody.createEl("tr");
		const ts = entry.timestamp ? entry.timestamp.toISOString().slice(0, 19) : "";
		const tdTs = tr.createEl("td", { text: ts });
		tdTs.classList.add("trace-cell-timestamp");
		const tdStatus = tr.createEl("td", { text: entry.status ?? "" });
		tdStatus.classList.add(...cellClassForField("status", entry.statusCategory).split(" "));
		const tdSubject = tr.createEl("td", { text: entry.subject ?? "" });
		tdSubject.classList.add("trace-cell-subject");
		const tdMsg = tr.createEl("td", { text: entry.message ?? entry.raw });
		tdMsg.classList.add("trace-cell-message");
	}
}

function renderSummary(el: HTMLElement, entries: LogEntry[], groupBy: "status" | "date"): void {
	el.empty();
	if (entries.length === 0) {
		el.createSpan({ text: "No entries matched your query.", cls: "trace-block-empty" });
		return;
	}
	const groups = groupEntries(entries, groupBy);
	const max = Math.max(...groups.map((g) => g.count), 1);
	const wrap = el.createDiv({ cls: "trace-summary" });
	for (const g of groups) {
		const row = wrap.createDiv({ cls: "trace-summary-row" });
		row.createSpan({ cls: "trace-summary-key", text: g.key });
		const barWrap = row.createDiv({ cls: "trace-summary-bar-wrap" });
		const bar = barWrap.createDiv({ cls: "trace-summary-bar" });
		bar.style.width = `${(g.count / max) * 100}%`;
		row.createSpan({ cls: "trace-summary-count", text: String(g.count) });
	}
}

export function registerTraceBlock(plugin: TracePlugin): void {
	plugin.registerMarkdownCodeBlockProcessor("trace", async (source, el) => {
		const params = parseTraceBlockSource(source);
		if (!params) {
			renderError(el, "missing required parameter — source");
			return;
		}

		const path = normalizePath(params.source);
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			renderError(el, `file not found — ${params.source}`);
			return;
		}

		let content: string;
		try {
			content = await plugin.app.vault.read(file);
		} catch {
			renderError(el, `file not found — ${params.source}`);
			return;
		}

		const cache = plugin.app.metadataCache.getFileCache(file);
		const format = resolveLogFormat(content, cache, file.extension);

		let parsed;
		try {
			parsed = detectAndParse(
				content,
				{
					format,
					columnMapping: resolveTraceColumns(cache),
					csvDelimiter: plugin.settings.csvDelimiter,
					customStatusMappings: plugin.settings.customStatusMappings,
				},
				plugin.settings,
			);
		} catch {
			renderError(el, "could not parse source file. Check logformat setting.");
			return;
		}

		if (parsed.entries.length === 0 && content.trim().length > 0) {
			renderError(el, "could not parse source file. Check logformat setting.");
			return;
		}

		const results = queryEntries(parsed.entries, params, plugin.settings.defaultQueryLimit);
		const display = params.display ?? "table";

		if (display === "summary") {
			renderSummary(el, results, params.groupBy ?? "status");
		} else {
			renderTable(el, results);
		}
	});
}
