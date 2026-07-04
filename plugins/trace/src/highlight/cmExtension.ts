import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type TracePlugin from "../main";
import { detectAndParse } from "../parser";
import { resolveColumnIndices } from "../parser/columnMapping";
import { decorationsForLogLine, decorationsForTableLine } from "./lineDecorations";
import { isTraceFile, resolveLogFormat, resolveTraceColumns } from "../traceContext";
import type { LogEntry } from "../types";

const DEBOUNCE_MS = 200;

function pushMark(decorations: Range<Decoration>[], from: number, to: number, className: string): void {
	if (to <= from || !className.trim()) return;
	decorations.push(Decoration.mark({ class: className }).range(from, to));
}

function buildDecorations(
	view: EditorView,
	plugin: TracePlugin,
): { deco: DecorationSet; entries: LogEntry[] } {
	const file = plugin.getActiveTraceFile(view);
	if (!file) return { deco: Decoration.none, entries: [] };

	const cache = plugin.app.metadataCache.getFileCache(file);
	if (!isTraceFile(file, cache)) return { deco: Decoration.none, entries: [] };

	const content = view.state.doc.toString();
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

	const decorations: Range<Decoration>[] = [];
	let tableHeaders: string[] | null = null;
	let colIndices: ReturnType<typeof resolveColumnIndices> | null = null;

	const entryByLine = new Map<number, LogEntry>();
	for (const e of parsed.entries) entryByLine.set(e.lineNumber, e);

	const doc = view.state.doc;
	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const entry = entryByLine.get(i) ?? null;

		if (parsed.format === "table") {
			const result = decorationsForTableLine(
				line.text,
				line.from,
				parsed.format,
				tableHeaders,
				colIndices,
				entry,
				plugin.settings,
			);
			tableHeaders = result.headers;
			colIndices = result.colIndices;
			for (const d of result.decorations) {
				pushMark(decorations, d.from, d.to, d.className);
			}
		} else if (entry) {
			for (const d of decorationsForLogLine(line.text, line.from, entry)) {
				pushMark(decorations, d.from, d.to, d.className);
			}
		}
	}

	return {
		deco: Decoration.set(decorations, true),
		entries: parsed.entries,
	};
}

export function traceEditorExtension(plugin: TracePlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			entries: LogEntry[] = [];
			private debounceTimer: number | undefined;

			constructor(view: EditorView) {
				const built = buildDecorations(view, plugin);
				this.decorations = built.deco;
				this.entries = built.entries;
				plugin.setViewEntries(view, this.entries);
			}

			update(update: ViewUpdate) {
				if (!update.docChanged && !update.viewportChanged) return;
				window.clearTimeout(this.debounceTimer);
				const view = update.view;
				this.debounceTimer = window.setTimeout(() => {
					const built = buildDecorations(view, plugin);
					this.decorations = built.deco;
					this.entries = built.entries;
					plugin.setViewEntries(view, this.entries);
					plugin.requestFilterRefresh();
					view.requestMeasure();
				}, DEBOUNCE_MS);
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}
