import type {Plugin} from "obsidian";
import {
	App,
	Editor,
	EditorSuggest,
	TFile,
	getAllTags,
	type EditorPosition,
	type EditorSuggestContext,
	type EditorSuggestTriggerInfo,
} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {VaultIndex} from "./VaultIndex";
import {normalizeIsoDateTime} from "./calendar/isoDateTime";
import {
	scheduleNextWeekIso,
	scheduleThisWeekendIso,
	scheduleTodayIso,
	scheduleTomorrowIso,
} from "./taskSchedulePresets";
import {isCheckboxLine, isInlineTaskLineInScope} from "./utils/inlineTasks";
import {effectiveInlineTaskIncludeTag} from "./utils/inlineTaskTag";

type InlineTaskSuggestKind = "tag" | "project" | "due" | "scheduled" | "priority";

interface InlineTaskSuggestItem {
	kind: InlineTaskSuggestKind;
	label: string;
	detail?: string;
	insert: string;
}

interface TriggerMeta {
	kind: InlineTaskSuggestKind;
	emoji: string;
}

const PRIORITY_EMOJIS = [
	{emoji: "⏫", label: "Highest"},
	{emoji: "🔼", label: "High"},
	{emoji: "🔽", label: "Low"},
	{emoji: "⏬", label: "Lowest"},
] as const;

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/u;

function textBeforeCursor(editor: Editor, cursor: EditorPosition): string {
	return editor.getLine(cursor.line).slice(0, cursor.ch);
}

function posAtIndex(line: number, index: number): EditorPosition {
	return {line, ch: index};
}

function buildDatePresets(settings: FulcrumSettings): {label: string; iso: string}[] {
	return [
		{label: "Today", iso: scheduleTodayIso()},
		{label: "Tomorrow", iso: scheduleTomorrowIso()},
		{label: "This weekend", iso: scheduleThisWeekendIso()},
		{label: "Next week", iso: scheduleNextWeekIso(settings.calendarFirstDayOfWeek)},
	];
}

function filterByQuery(items: string[], query: string, limit: number): string[] {
	const q = query.toLowerCase();
	const filtered = q
		? items.filter((item) => item.toLowerCase().includes(q))
		: items;
	return filtered.slice(0, limit);
}

function collectVaultTagNames(app: App): string[] {
	const tagSet = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;
		const tags = getAllTags(cache);
		if (!tags) continue;
		for (const t of tags) tagSet.add(t.replace(/^#/, ""));
	}
	return [...tagSet].sort((a, b) => a.localeCompare(b));
}

export class InlineTaskEditorSuggest extends EditorSuggest<InlineTaskSuggestItem> {
	private triggerMeta: TriggerMeta | null = null;

	constructor(
		app: App,
		private readonly getSettings: () => FulcrumSettings,
		private readonly getVaultIndex: () => VaultIndex,
	) {
		super(app);
		this.limit = 12;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null,
	): EditorSuggestTriggerInfo | null {
		this.triggerMeta = null;
		if (!file) return null;

		const settings = this.getSettings();
		if (!isInlineTaskLineInScope(file.path, settings)) return null;

		const lineText = editor.getLine(cursor.line);
		if (!isCheckboxLine(lineText)) return null;

		const before = textBeforeCursor(editor, cursor);

		const projectMatch = before.match(/\[\[([^\]|]*)$/u);
		if (projectMatch) {
			const start = posAtIndex(cursor.line, before.length - projectMatch[0].length);
			this.triggerMeta = {kind: "project", emoji: "[["};
			return {start, end: cursor, query: projectMatch[1] ?? ""};
		}

		const plusProjectMatch = before.match(/(?:^|\s)\+([\w-]*)$/u);
		if (plusProjectMatch) {
			const query = plusProjectMatch[1] ?? "";
			const start = posAtIndex(cursor.line, before.length - query.length - 1);
			this.triggerMeta = {kind: "project", emoji: "+"};
			return {start, end: cursor, query};
		}

		const tagMatch = before.match(/(?:^|\s)#([\w-]*)$/u);
		if (tagMatch) {
			const start = posAtIndex(cursor.line, before.length - (tagMatch[1]?.length ?? 0) - 1);
			this.triggerMeta = {kind: "tag", emoji: "#"};
			return {start, end: cursor, query: tagMatch[1] ?? ""};
		}

		const dueMatch = before.match(/(📅|⏰|📆)\s*([\w\d:-]*)$/u);
		if (dueMatch) {
			const emoji = dueMatch[1] ?? "📅";
			const start = posAtIndex(cursor.line, before.length - dueMatch[0].length);
			this.triggerMeta = {kind: "due", emoji};
			return {start, end: cursor, query: dueMatch[2] ?? ""};
		}

		const schedMatch = before.match(/(⏳|⏫)\s+([\w\d:-]*)$/u);
		if (schedMatch) {
			const emoji = schedMatch[1] ?? "⏳";
			const start = posAtIndex(cursor.line, before.length - schedMatch[0].length);
			this.triggerMeta = {kind: "scheduled", emoji};
			return {start, end: cursor, query: schedMatch[2] ?? ""};
		}

		const priorityMatch = before.match(/(⏫|🔼|🔽|⏬)$/u);
		if (priorityMatch) {
			const start = posAtIndex(cursor.line, before.length - priorityMatch[0].length);
			this.triggerMeta = {kind: "priority", emoji: priorityMatch[1] ?? "⏫"};
			return {start, end: cursor, query: priorityMatch[1] ?? ""};
		}

		return null;
	}

	getSuggestions(context: EditorSuggestContext): InlineTaskSuggestItem[] {
		const meta = this.triggerMeta;
		if (!meta) return [];

		const settings = this.getSettings();
		const query = context.query ?? "";

		switch (meta.kind) {
			case "tag":
				return this.tagSuggestions(settings, query);
			case "project":
				return this.projectSuggestions(query);
			case "due":
				return this.dateSuggestions(meta.emoji, query, settings);
			case "scheduled":
				return this.dateSuggestions(meta.emoji, query, settings);
			case "priority":
				return this.prioritySuggestions(query);
			default:
				return [];
		}
	}

	private tagSuggestions(settings: FulcrumSettings, query: string): InlineTaskSuggestItem[] {
		const pinned = effectiveInlineTaskIncludeTag(settings);
		const vaultTags = collectVaultTagNames(this.app);
		const merged = [...new Set([...(pinned ? [pinned] : []), ...vaultTags])];
		return filterByQuery(merged, query, this.limit).map((tag) => ({
			kind: "tag" as const,
			label: `#${tag}`,
			insert: `#${tag}`,
		}));
	}

	private projectSuggestions(query: string): InlineTaskSuggestItem[] {
		const projects = this.getVaultIndex().getSnapshot().projects;
		const names = projects.map((p) => p.name);
		return filterByQuery(names, query, this.limit).map((name) => ({
			kind: "project" as const,
			label: name,
			detail: "Project",
			insert: `[[${name}]]`,
		}));
	}

	private dateSuggestions(
		emoji: string,
		query: string,
		settings: FulcrumSettings,
	): InlineTaskSuggestItem[] {
		const items: InlineTaskSuggestItem[] = [];
		for (const preset of buildDatePresets(settings)) {
			if (query && !preset.iso.startsWith(query) && !preset.label.toLowerCase().includes(query.toLowerCase())) {
				continue;
			}
			items.push({
				kind: emoji === "⏳" || emoji === "⏫" ? "scheduled" : "due",
				label: preset.label,
				detail: preset.iso,
				insert: `${emoji} ${preset.iso}`,
			});
		}
		const normalized = normalizeIsoDateTime(query);
		if (query && (ISO_DATE_PREFIX.test(query) || normalized)) {
			const iso = normalized ?? query;
			items.unshift({
				kind: emoji === "⏳" || emoji === "⏫" ? "scheduled" : "due",
				label: iso,
				detail: "Typed date",
				insert: `${emoji} ${iso}`,
			});
		}
		return items.slice(0, this.limit);
	}

	private prioritySuggestions(query: string): InlineTaskSuggestItem[] {
		return PRIORITY_EMOJIS.filter(
			(p) => !query || p.emoji.includes(query) || p.label.toLowerCase().includes(query.toLowerCase()),
		).map((p) => ({
			kind: "priority" as const,
			label: p.emoji,
			detail: p.label,
			insert: p.emoji,
		}));
	}

	renderSuggestion(item: InlineTaskSuggestItem, el: HTMLElement): void {
		el.setText(item.label);
		if (item.detail) {
			el.createSpan({cls: "fulcrum-inline-suggest-detail", text: item.detail});
		}
	}

	selectSuggestion(item: InlineTaskSuggestItem, _evt: MouseEvent | KeyboardEvent): void {
		const ctx = this.context;
		if (!ctx) return;
		ctx.editor.replaceRange(item.insert, ctx.start, ctx.end);
	}

}

export function registerInlineTaskEditorSuggest(
	plugin: Plugin,
	getSettings: () => FulcrumSettings,
	getVaultIndex: () => VaultIndex,
): void {
	plugin.registerEditorSuggest(
		new InlineTaskEditorSuggest(plugin.app, getSettings, getVaultIndex),
	);
}
