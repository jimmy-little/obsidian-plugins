import { MarkdownRenderer, setIcon, type App, type Component } from "obsidian";
import type { JournalEntry } from "../journal";
import { journalEntryKey } from "../journal";
import type QuillPlugin from "../main";
import {
	buildJournalEntryChips,
	leadingTimelineEmojiFromEntryType,
	type QuillActivityChip,
} from "./journalEntryChips";
import { loadJournalEntryPreviews } from "./loadEntryPreviews";

const CALENDAR_SVG = `<svg class="quill-activity-chip__icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const CLOCK_SVG = `<svg class="quill-activity-chip__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const TIMER_SVG = `<svg class="quill-activity-chip__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14M6 3v3a7 7 0 0 0 6 6.92A7 7 0 0 0 18 6V3M6 21v-3a7 7 0 0 1 6-6.92A7 7 0 0 1 18 18v3M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FILE_TOUCH_SVG = `<svg class="quill-activity-chip__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 10h6M12 13V7M9 17h6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const NOTE_FILE_SVG = `<svg class="quill-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 13h8M8 17h8M8 9h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** Max entries that receive async body previews in one timeline (avoids vault read storms). */
const PREVIEW_CAP = 120;

export type RenderActivityTimelineOptions = {
	entries: JournalEntry[];
	showJournalChip?: boolean;
	/** When set, all rows use this accent (e.g. single journal / project view). */
	timelineAccentCss?: string;
	/** Insert day marker rows between groups (list view). Off for Fulcrum-style flat feeds. */
	showDayMarkers?: boolean;
	/** Hide the semantic date chip (e.g. day view where the header shows the date). */
	hideDateChip?: boolean;
	getJournalColor: (journalName: string) => string;
	getEntryTypeIcon: (typeName: string | null) => string;
	onOpenEntry: (entry: JournalEntry) => void;
	previewOwner: Component;
};

export type TimelineDayGroup = {
	dateKey: string;
	entries: JournalEntry[];
};

function appendChip(parent: HTMLElement, chip: QuillActivityChip): void {
	const el = parent.createSpan({ cls: `quill-activity-chip quill-activity-chip--${chip.kind}` });
	if (chip.kind === "date") {
		el.insertAdjacentHTML("afterbegin", CALENDAR_SVG);
	} else if (chip.kind === "time") {
		el.insertAdjacentHTML("afterbegin", CLOCK_SVG);
	} else if (chip.kind === "tracked") {
		el.insertAdjacentHTML("afterbegin", TIMER_SVG);
	} else if (chip.kind === "fileTouch") {
		el.insertAdjacentHTML("afterbegin", FILE_TOUCH_SVG);
	}
	if (chip.kind === "tag") {
		el.dataset.tagValue = chip.label.replace(/^#/, "");
	}
	el.createSpan({ text: chip.label });
}

function rowAccent(entry: JournalEntry, opts: RenderActivityTimelineOptions): string {
	if (opts.timelineAccentCss) return opts.timelineAccentCss;
	return opts.getJournalColor(entry.journal || "Default");
}

function createTimelineTrack(
	parent: HTMLElement,
	accentColor: string,
	opts: { emoji?: string; lucideIcon?: string },
): void {
	const track = parent.createDiv("quill-activity-timeline__track quill-activity-timeline__track--accent");
	track.style.setProperty("--quill-row-accent", accentColor);
	track.setAttribute("aria-hidden", "true");
	track.createDiv("quill-activity-timeline__stem quill-activity-timeline__stem--before");
	const node = track.createDiv("quill-activity-timeline__node");
	if (opts.emoji) {
		node.addClass("quill-activity-timeline__node--emoji");
		node.createSpan({ cls: "quill-activity-timeline__emoji", text: opts.emoji });
	} else if (opts.lucideIcon) {
		node.addClass("quill-activity-timeline__node--lucide");
		const wrap = node.createSpan("quill-activity-timeline__icon-wrap");
		setIcon(wrap, opts.lucideIcon);
	} else {
		node.insertAdjacentHTML("beforeend", NOTE_FILE_SVG);
	}
	track.createDiv("quill-activity-timeline__stem quill-activity-timeline__stem--after");
}

function resolveTimelineNode(
	entry: JournalEntry,
	getEntryTypeIcon: (typeName: string | null) => string,
): { emoji?: string; lucideIcon?: string } {
	if (entry.entryType) {
		const icon = getEntryTypeIcon(entry.entryType);
		if (icon && icon !== "file-text") return { lucideIcon: icon };
		const emoji = leadingTimelineEmojiFromEntryType(entry.entryType);
		if (emoji) return { emoji };
	}
	if (entry.hasLapseEntries) return { lucideIcon: "timer" };
	return {};
}

function createTimelineRow(parent: HTMLElement, entry: JournalEntry, opts: RenderActivityTimelineOptions): void {
	const row = parent.createDiv({ cls: "quill-activity-row quill-activity-row--timeline" });
	row.setAttribute("role", "button");
	row.setAttribute("tabindex", "0");
	row.dataset.quillEntryKey = journalEntryKey(entry);

	const accent = rowAccent(entry, opts);
	const node = resolveTimelineNode(entry, opts.getEntryTypeIcon);

	createTimelineTrack(row, accent, node);

	const body = row.createDiv("quill-activity-row__body");
	body.createDiv({ cls: "quill-activity-row__title", text: entry.name });

	const chips = buildJournalEntryChips(entry, {
		showJournal: opts.showJournalChip,
		hideDate: opts.hideDateChip,
		showFileModified: !entry.fromLogFile,
	});
	if (chips.length > 0) {
		const meta = body.createDiv("quill-activity-row__meta");
		for (const chip of chips) appendChip(meta, chip);
	}

	const open = (): void => opts.onOpenEntry(entry);
	row.addEventListener("click", (ev: MouseEvent) => {
		if ((ev.target as HTMLElement | null)?.closest(".quill-activity-row__preview a")) return;
		open();
	});
	row.addEventListener("keydown", (ev: KeyboardEvent) => {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		open();
	});
}

function appendDayMarker(list: HTMLElement, dateKey: string): void {
	const [y, m, d] = dateKey.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	const li = list.createEl("li", { cls: "quill-list-day-marker" });
	const wrap = li.createDiv("quill-list-day-group quill-list-day-group--marker");
	const header = wrap.createDiv("quill-list-day-header-wrap");
	header.createEl("div", {
		cls: "quill-list-day-weekday",
		text: date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase().slice(0, 3),
	});
	header.createEl("div", { cls: "quill-list-day-num", text: String(d) });
}

export function setTimelinePreviewKey(
	mount: HTMLElement,
	entries: JournalEntry[],
	plugin: QuillPlugin,
): string {
	const key = `${entries.map((e) => journalEntryKey(e)).join("\0")}\0${plugin.settings.entryPreviewMaxLines}\0${plugin.settings.entryProperty}`;
	mount.dataset.quillPreviewKey = key;
	return key;
}

function buildTimelineShell(
	mount: HTMLElement,
	groups: TimelineDayGroup[],
	opts: RenderActivityTimelineOptions,
	plugin: QuillPlugin,
): { list: HTMLElement; allEntries: JournalEntry[]; previewKey: string } | null {
	mount.empty();
	const allEntries = groups.flatMap((g) => g.entries);
	if (allEntries.length === 0) return null;

	const previewKey = setTimelinePreviewKey(mount, allEntries, plugin);
	const list = mount.createEl("ul", { cls: "quill-activity-list quill-activity-list--timeline" });
	const showDayMarkers = opts.showDayMarkers ?? false;

	for (const group of groups) {
		if (group.entries.length === 0) continue;
		if (showDayMarkers) appendDayMarker(list, group.dateKey);
		for (const entry of group.entries) {
			const li = list.createEl("li");
			createTimelineRow(li, entry, opts);
		}
	}

	return { list, allEntries, previewKey };
}

async function attachPreviews(
	app: App,
	mount: HTMLElement,
	list: HTMLElement,
	allEntries: JournalEntry[],
	previewKey: string,
	opts: RenderActivityTimelineOptions,
	plugin: QuillPlugin,
): Promise<void> {
	const maxLines = Math.max(1, plugin.settings.entryPreviewMaxLines ?? 10);
	const previewEntries = allEntries.slice(0, PREVIEW_CAP);
	const previews = await loadJournalEntryPreviews(
		app.vault,
		previewEntries,
		plugin.settings.entryProperty || "entry",
		maxLines,
	);

	if (!mount.isConnected) return;
	if (mount.dataset.quillPreviewKey !== previewKey) return;

	for (const entry of previewEntries) {
		const entryKey = journalEntryKey(entry);
		const md = previews[entryKey];
		if (!md) continue;
		const row = list.querySelector(
			`.quill-activity-row[data-quill-entry-key="${CSS.escape(entryKey)}"]`,
		);
		if (!row) continue;
		const body = row.querySelector(".quill-activity-row__body");
		if (!(body instanceof HTMLElement)) continue;
		if (body.querySelector(".quill-activity-row__preview")) continue;
		const preview = body.createDiv("quill-activity-row__preview");
		preview.style.setProperty("--quill-preview-accent", rowAccent(entry, opts));
		void MarkdownRenderer.render(app, md, preview, entry.file.path, opts.previewOwner);
	}
}

/** Build day groups sorted newest-first (Fulcrum Activity feed order). */
export function buildTimelineDayGroupsNewestFirst(entries: JournalEntry[]): TimelineDayGroup[] {
	const byDate = new Map<string, JournalEntry[]>();
	for (const entry of entries) {
		const list = byDate.get(entry.date) ?? [];
		list.push(entry);
		byDate.set(entry.date, list);
	}
	return [...byDate.keys()]
		.sort((a, b) => b.localeCompare(a))
		.map((dateKey) => ({
			dateKey,
			entries: (byDate.get(dateKey) ?? []).sort((a, b) =>
				(b.time || "00:00").localeCompare(a.time || "00:00"),
			),
		}));
}

/** One continuous timeline for a flat entry list (day view). */
export async function renderActivityTimeline(
	app: App,
	plugin: QuillPlugin,
	mount: HTMLElement,
	opts: RenderActivityTimelineOptions,
): Promise<void> {
	const groups: TimelineDayGroup[] = [];
	const byDate = new Map<string, JournalEntry[]>();
	for (const entry of opts.entries) {
		const list = byDate.get(entry.date) ?? [];
		list.push(entry);
		byDate.set(entry.date, list);
	}
	for (const dateKey of [...byDate.keys()].sort((a, b) => a.localeCompare(b))) {
		const dayEntries = byDate.get(dateKey) ?? [];
		dayEntries.sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
		groups.push({ dateKey, entries: dayEntries });
	}
	await renderGroupedActivityTimeline(app, plugin, mount, groups, opts);
}

/** List view: one timeline with optional day markers (single DOM tree + one preview batch). */
export async function renderGroupedActivityTimeline(
	app: App,
	plugin: QuillPlugin,
	mount: HTMLElement,
	groups: TimelineDayGroup[],
	opts: RenderActivityTimelineOptions,
): Promise<void> {
	const shell = buildTimelineShell(mount, groups, opts, plugin);
	if (!shell) return;
	await attachPreviews(
		app,
		mount,
		shell.list,
		shell.allEntries,
		shell.previewKey,
		opts,
		plugin,
	);
}
