import { setIcon, TFile } from "obsidian";
import type { HomeTimelineDayGroup, HomeTimelineItem } from "./homeActivity";
import { formatWorkoutStatsLine } from "../workout/workoutListUi";
import type { WorkoutListEntry } from "../workout/types";

export interface RenderHomeTimelineOptions {
	weightUnit: "lb" | "kg";
	onOpenWorkout: (path: string) => void;
	onOpenNutritionDay: (date: string) => void;
	onOpenStatsNote: (path: string) => void;
	getWorkoutIconUrl?: (iconName: string) => string | null;
	workoutMetaByPath?: Map<string, WorkoutListEntry>;
}

function bindRowActivation(row: HTMLElement, onClick: () => void): void {
	row.setAttribute("role", "button");
	row.setAttribute("tabindex", "0");
	row.addEventListener("click", onClick);
	row.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
	});
}

function renderTimelineTrack(
	parent: HTMLElement,
	item: HomeTimelineItem,
	opts: RenderHomeTimelineOptions,
): void {
	const track = parent.createDiv({
		cls: "pulse-workout-activity-timeline__track pulse-workout-activity-timeline__track--accent",
	});
	track.createDiv({ cls: "pulse-workout-activity-timeline__stem pulse-workout-activity-timeline__stem--before" });
	const node = track.createDiv({ cls: "pulse-workout-activity-timeline__node" });

	if (item.kind === "workout" && item.iconName && opts.getWorkoutIconUrl) {
		const iconUrl = opts.getWorkoutIconUrl(item.iconName);
		if (iconUrl) {
			node.createEl("img", {
				cls: "pulse-workout-activity-timeline__icon",
				attr: { src: iconUrl, alt: "", loading: "lazy", decoding: "async" },
			});
		} else {
			const iconEl = node.createSpan({ cls: "pulse-workout-activity-timeline__lucide" });
			setIcon(iconEl, "dumbbell");
		}
	} else {
		const iconEl = node.createSpan({ cls: "pulse-workout-activity-timeline__lucide" });
		if (item.kind === "bodyComp") setIcon(iconEl, "scale");
		else if (item.kind === "nutrition") setIcon(iconEl, "utensils");
		else setIcon(iconEl, "dumbbell");
	}

	track.createDiv({ cls: "pulse-workout-activity-timeline__stem pulse-workout-activity-timeline__stem--after" });
}

function workoutMetaLine(item: HomeTimelineItem, opts: RenderHomeTimelineOptions): string {
	if (item.meta) return item.meta;
	if (!item.workoutPath || !opts.workoutMetaByPath) return "";
	const entry = opts.workoutMetaByPath.get(item.workoutPath);
	if (!entry) return "";
	return formatWorkoutStatsLine(entry, opts.weightUnit);
}

function itemClickHandler(item: HomeTimelineItem, opts: RenderHomeTimelineOptions): () => void {
	return () => {
		if (item.kind === "workout" && item.workoutPath) {
			opts.onOpenWorkout(item.workoutPath);
			return;
		}
		if (item.kind === "nutrition") {
			opts.onOpenNutritionDay(item.date);
			return;
		}
		if (item.kind === "bodyComp" && item.statsNotePath) {
			opts.onOpenStatsNote(item.statsNotePath);
		}
	};
}

export function renderHomeActivityTimeline(
	parent: HTMLElement,
	groups: HomeTimelineDayGroup[],
	opts: RenderHomeTimelineOptions,
): void {
	parent.empty();

	if (groups.length === 0) {
		parent.createEl("p", {
			text: "No activity in the last two weeks. Log workouts, food, or body measurements to see them here.",
			cls: "pulse-workout-muted",
		});
		return;
	}

	const groupsWrap = parent.createDiv({ cls: "pulse-workout-groups pulse-workout-groups--timeline" });
	for (const group of groups) {
		const groupEl = groupsWrap.createDiv({ cls: "pulse-workout-timeline-group" });
		groupEl.createEl("h4", { cls: "pulse-workout-timeline-group__title", text: group.label });

		const list = groupEl.createEl("ul", {
			cls: "pulse-workout-activity-list pulse-workout-activity-list--timeline",
		});

		for (const item of group.items) {
			const li = list.createEl("li");
			const row = li.createDiv({ cls: "pulse-workout-activity-row pulse-workout-activity-row--timeline" });
			bindRowActivation(row, itemClickHandler(item, opts));
			renderTimelineTrack(row, item, opts);

			const body = row.createDiv({ cls: "pulse-workout-activity-row__body" });
			body.createDiv({ cls: "pulse-workout-activity-row__title", text: item.title });
			const meta = item.kind === "workout" ? workoutMetaLine(item, opts) : item.meta;
			if (meta) {
				body.createDiv({ cls: "pulse-workout-activity-row__meta", text: meta });
			}
		}
	}
}

export function openStatsNotePath(
	app: import("obsidian").App,
	path: string,
): void {
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) void app.workspace.getLeaf("tab").openFile(file);
}
