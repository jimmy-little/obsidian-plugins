import { Menu } from "obsidian";
import type { WorkoutListEntry } from "./types";
import { formatWorkoutDuration } from "./workoutSessionStats";

export const HOME_TIMELINE_DAYS = 14;

/** Keep workouts whose date falls within the last `days` calendar days (inclusive). */
export function filterWorkoutEntriesToRecentDays(
	entries: WorkoutListEntry[],
	days: number,
): WorkoutListEntry[] {
	if (days <= 0) return entries;
	const cutoff = new Date();
	cutoff.setHours(0, 0, 0, 0);
	cutoff.setDate(cutoff.getDate() - (days - 1));
	const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
	return entries.filter((entry) => entry.date >= cutoffIso);
}

export interface WorkoutDateGroup {
	date: string;
	label: string;
	entries: WorkoutListEntry[];
	/** Aggregated stats for the day (`duration | kcal | volume`). */
	statsLine: string;
}

function sortEntriesChronologically(entries: WorkoutListEntry[]): WorkoutListEntry[] {
	return [...entries].sort((a, b) => {
		const ta = a.startTimeIso ?? "";
		const tb = b.startTimeIso ?? "";
		if (ta && tb) {
			const c = ta.localeCompare(tb);
			if (c !== 0) return c;
		} else if (ta) return -1;
		else if (tb) return 1;
		return a.path.localeCompare(b.path);
	});
}

function aggregateWorkoutDayStats(entries: WorkoutListEntry[]): {
	duration?: number;
	calories?: number;
	volume?: number;
} {
	let duration = 0;
	let calories = 0;
	let volume = 0;
	let hasDuration = false;
	let hasCalories = false;
	let hasVolume = false;

	for (const entry of entries) {
		if (entry.duration != null && entry.duration > 0) {
			duration += entry.duration;
			hasDuration = true;
		}
		if (entry.calories != null && entry.calories > 0) {
			calories += entry.calories;
			hasCalories = true;
		}
		if (entry.volume != null && entry.volume > 0) {
			volume += entry.volume;
			hasVolume = true;
		}
	}

	return {
		duration: hasDuration ? duration : undefined,
		calories: hasCalories ? calories : undefined,
		volume: hasVolume ? volume : undefined,
	};
}

/** Day totals: `45 min | 320kcal | 12,450 lbs` — only present aggregates. */
export function formatWorkoutDayStatsLine(
	entries: WorkoutListEntry[],
	weightUnit: "lb" | "kg",
): string {
	const agg = aggregateWorkoutDayStats(entries);
	const parts: string[] = [];
	if (agg.duration != null && agg.duration > 0) {
		const d = formatWorkoutDuration(agg.duration);
		if (d) parts.push(d);
	}
	if (agg.calories != null && agg.calories > 0) {
		parts.push(`${Math.round(agg.calories)}kcal`);
	}
	if (agg.volume != null && agg.volume > 0) {
		parts.push(formatVolumeLabel(agg.volume, weightUnit));
	}
	return parts.join(" | ");
}

export function formatWorkoutStartTimeLabel(startIso: string): string {
	const d = new Date(startIso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatWorkoutDateGroupLabel(isoDate: string): string {
	if (!isoDate || isoDate === "Unknown") return "Unknown date";
	const d = new Date(`${isoDate}T12:00:00`);
	if (Number.isNaN(d.getTime())) return isoDate;

	const today = new Date();
	today.setHours(12, 0, 0, 0);
	const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
	if (diff === 0) return "Today";
	if (diff === -1) return "Yesterday";
	if (diff === 1) return "Tomorrow";

	return d.toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
	});
}

function formatVolumeLabel(volume: number, weightUnit: "lb" | "kg"): string {
	const unit = weightUnit === "lb" ? "lbs" : "kg";
	return `${Math.round(volume).toLocaleString()} ${unit}`;
}

/** `6:09 AM | 19 min | 150kcal | 6,775 lbs` — only present fields. */
export function formatWorkoutStatsLine(
	entry: WorkoutListEntry,
	weightUnit: "lb" | "kg",
): string {
	const parts: string[] = [];
	if (entry.startTimeIso) {
		const t = formatWorkoutStartTimeLabel(entry.startTimeIso);
		if (t) parts.push(t);
	}
	if (entry.duration && entry.duration > 0) {
		const d = formatWorkoutDuration(entry.duration);
		if (d) parts.push(d);
	}
	if (entry.calories != null && entry.calories > 0) {
		parts.push(`${Math.round(entry.calories)}kcal`);
	}
	if (entry.volume != null && entry.volume > 0) {
		parts.push(formatVolumeLabel(entry.volume, weightUnit));
	}
	return parts.join(" | ");
}

export function groupWorkoutEntriesByDate(
	entries: WorkoutListEntry[],
	weightUnit: "lb" | "kg" = "lb",
): WorkoutDateGroup[] {
	const map = new Map<string, WorkoutListEntry[]>();
	for (const entry of entries) {
		const date = entry.date || "Unknown";
		if (!map.has(date)) map.set(date, []);
		map.get(date)!.push(entry);
	}

	return [...map.keys()]
		.sort((a, b) => b.localeCompare(a))
		.map((date) => {
			const dayEntries = sortEntriesChronologically(map.get(date)!);
			return {
				date,
				label: formatWorkoutDateGroupLabel(date),
				entries: dayEntries,
				statsLine: formatWorkoutDayStatsLine(dayEntries, weightUnit),
			};
		});
}

function appendQuickNotes(parent: HTMLElement, notes: string[] | undefined): void {
	if (!notes?.length) return;
	const ul = parent.createEl("ul", { cls: "pulse-workout-activity-notes" });
	for (const note of notes) {
		ul.createEl("li", { text: note });
	}
}

function bindWorkoutRowNavigation(
	row: HTMLElement,
	path: string,
	onSelect: (path: string) => void,
): void {
	row.setAttribute("role", "button");
	row.setAttribute("tabindex", "0");
	row.dataset.workoutPath = path;
	const go = () => onSelect(path);
	row.addEventListener("click", go);
	row.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			go();
		}
	});
}

function bindWorkoutRowContextMenu(
	row: HTMLElement,
	entry: WorkoutListEntry,
	opts: RenderWorkoutListOptions,
): void {
	const hasMerge = Boolean(opts.onMerge && opts.allEntries);
	const hasBanner = Boolean(opts.onUpdateBanner);
	const hasDelete = Boolean(opts.onDelete);
	if (!hasMerge && !hasBanner && !hasDelete) return;

	row.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		const menu = new Menu();
		if (hasBanner) {
			menu.addItem((item) =>
				item
					.setTitle("Update banner")
					.setIcon("image")
					.onClick(() => opts.onUpdateBanner!(entry)),
			);
		}
		if (hasMerge) {
			const sameDay = opts.allEntries!.filter(
				(other) => other.date === entry.date && other.path !== entry.path,
			);
			menu.addItem((item) =>
				item
					.setTitle("Merge with…")
					.setIcon("combine")
					.setDisabled(sameDay.length === 0)
					.onClick(() => opts.onMerge!(entry, sameDay)),
			);
		}
		if (hasDelete) {
			if (hasBanner || hasMerge) menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Delete file")
					.setIcon("trash")
					.onClick(() => opts.onDelete!(entry)),
			);
		}
		menu.showAtMouseEvent(e);
	});
}

export interface RenderWorkoutListOptions {
	weightUnit: "lb" | "kg";
	activePath?: string | null;
	onSelect: (path: string) => void;
	/** Same-day merge targets (sidebar). */
	allEntries?: WorkoutListEntry[];
	onMerge?: (source: WorkoutListEntry, sameDayTargets: WorkoutListEntry[]) => void;
	onUpdateBanner?: (entry: WorkoutListEntry) => void;
	onDelete?: (entry: WorkoutListEntry) => void;
	getIconUrl?: (iconName: string) => string | null;
	maxDays?: number;
}

export function renderWorkoutSidebarList(
	parent: HTMLElement,
	entries: WorkoutListEntry[],
	opts: RenderWorkoutListOptions,
): void {
	parent.empty();
	if (entries.length === 0) {
		parent.createDiv({
			text: "No workouts yet. Import from Health / Gravl or add session notes under your Sessions folder.",
			cls: "pulse-sidebar__empty",
		});
		return;
	}

	const groupsWrap = parent.createDiv({ cls: "pulse-workout-groups" });
	for (const group of groupWorkoutEntriesByDate(entries, opts.weightUnit)) {
		const groupEl = groupsWrap.createDiv({ cls: "pulse-sidebar__group" });
		const header = groupEl.createDiv({ cls: "pulse-sidebar__group-header" });
		header.createDiv({ cls: "pulse-sidebar__group-title", text: group.label });
		if (group.statsLine) {
			header.createDiv({ cls: "pulse-sidebar__group-subtitle", text: group.statsLine });
		}

		const list = groupEl.createEl("ul", { cls: "pulse-sidebar__list" });
		for (const entry of group.entries) {
			const li = list.createEl("li", { cls: "pulse-sidebar__workout-item" });
			const isActive =
				opts.activePath != null &&
				opts.activePath !== "" &&
				opts.activePath === entry.path;
			const row = li.createDiv({
				cls: `pulse-sidebar__row${isActive ? " pulse-sidebar__row--active" : ""}`,
			});
			bindWorkoutRowNavigation(row, entry.path, opts.onSelect);
			bindWorkoutRowContextMenu(row, entry, opts);

			const inner = row.createDiv({
				cls: "pulse-sidebar__row-inner pulse-sidebar__row-inner--workout",
			});
			if (entry.iconName && opts.getIconUrl) {
				const iconUrl = opts.getIconUrl(entry.iconName);
				if (iconUrl) {
					const iconWrap = inner.createDiv({ cls: "pulse-sidebar__workout-icon-wrap" });
					iconWrap.createEl("img", {
						cls: "pulse-sidebar__workout-icon",
						attr: { src: iconUrl, alt: "", loading: "lazy", decoding: "async" },
					});
				}
			}

			const textCol = inner.createDiv({ cls: "pulse-sidebar__row-text" });
			textCol.createSpan({ text: entry.displayName, cls: "pulse-sidebar__row-name" });

			const stats = formatWorkoutStatsLine(entry, opts.weightUnit);
			if (stats) {
				textCol.createSpan({ text: stats, cls: "pulse-workout-activity-meta" });
			}

			appendQuickNotes(textCol, entry.quickNotes);
		}
	}
}

function renderTimelineTrack(
	parent: HTMLElement,
	entry: WorkoutListEntry,
	opts: RenderWorkoutListOptions,
): void {
	const track = parent.createDiv({
		cls: "pulse-workout-activity-timeline__track pulse-workout-activity-timeline__track--accent",
	});
	track.createDiv({ cls: "pulse-workout-activity-timeline__stem pulse-workout-activity-timeline__stem--before" });
	const node = track.createDiv({ cls: "pulse-workout-activity-timeline__node" });
	const iconUrl =
		entry.iconName && opts.getIconUrl ? opts.getIconUrl(entry.iconName) : null;
	if (iconUrl) {
		node.createEl("img", {
			cls: "pulse-workout-activity-timeline__icon",
			attr: { src: iconUrl, alt: "", loading: "lazy", decoding: "async" },
		});
	} else {
		node.createSpan({ cls: "pulse-workout-activity-timeline__emoji", text: "💪" });
	}
	track.createDiv({ cls: "pulse-workout-activity-timeline__stem pulse-workout-activity-timeline__stem--after" });
}

export function renderWorkoutTimelineList(
	parent: HTMLElement,
	entries: WorkoutListEntry[],
	opts: RenderWorkoutListOptions,
): void {
	parent.empty();

	const visibleEntries =
		opts.maxDays != null && opts.maxDays > 0
			? filterWorkoutEntriesToRecentDays(entries, opts.maxDays)
			: entries;

	if (visibleEntries.length === 0) {
		parent.createEl("p", {
			text: "No workouts yet. Import from Health Auto Export, Gravl CSV, etc., or scan your import folder.",
			cls: "pulse-workout-muted",
		});
		return;
	}

	const groupsWrap = parent.createDiv({ cls: "pulse-workout-groups pulse-workout-groups--timeline" });
	for (const group of groupWorkoutEntriesByDate(visibleEntries, opts.weightUnit)) {
		const groupEl = groupsWrap.createDiv({ cls: "pulse-workout-timeline-group" });
		groupEl.createEl("h4", { cls: "pulse-workout-timeline-group__title", text: group.label });

		const list = groupEl.createEl("ul", {
			cls: "pulse-workout-activity-list pulse-workout-activity-list--timeline",
		});

		for (const entry of group.entries) {
			const li = list.createEl("li");
			const row = li.createDiv({ cls: "pulse-workout-activity-row pulse-workout-activity-row--timeline" });
			bindWorkoutRowNavigation(row, entry.path, opts.onSelect);

			renderTimelineTrack(row, entry, opts);

			const body = row.createDiv({ cls: "pulse-workout-activity-row__body" });
			body.createDiv({ cls: "pulse-workout-activity-row__title", text: entry.displayName });

			const stats = formatWorkoutStatsLine(entry, opts.weightUnit);
			if (stats) {
				body.createDiv({ cls: "pulse-workout-activity-row__meta", text: stats });
			}

			appendQuickNotes(body, entry.quickNotes);
		}
	}
}
