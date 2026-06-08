import {writable} from "svelte/store";
import type {AreaFilterState} from "./utils/areaFocusFilter";

const WORK_RELATED_ONLY_LS = "fulcrum-show-work-related-only";
const AREA_FILTER_LS = "fulcrum-area-filter-state";
const AREA_FILTER_MIGRATED_LS = "fulcrum-area-filter-migrated-v1";
const AREA_FILTER_PANEL_COLLAPSED_LS = "fulcrum-area-filter-panel-collapsed";

function readJsonArray(key: string): string[] {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x): x is string => typeof x === "string");
	} catch {
		return [];
	}
}

function readAreaFilterStateInitial(): AreaFilterState {
	const state: AreaFilterState = {
		disabledLifeModes: readJsonArray(`${AREA_FILTER_LS}:modes`),
		disabledAreaPaths: readJsonArray(`${AREA_FILTER_LS}:paths`),
	};
	try {
		if (localStorage.getItem(AREA_FILTER_MIGRATED_LS) !== "1") {
			if (localStorage.getItem(WORK_RELATED_ONLY_LS) === "1") {
				state.disabledLifeModes = ["personal", "professional", "freelance", "other"];
			}
			localStorage.setItem(AREA_FILTER_MIGRATED_LS, "1");
			persistAreaFilterState(state);
		}
	} catch {
		/* private mode / quota */
	}
	return state;
}

export function persistAreaFilterState(state: AreaFilterState): void {
	try {
		localStorage.setItem(`${AREA_FILTER_LS}:modes`, JSON.stringify(state.disabledLifeModes));
		localStorage.setItem(`${AREA_FILTER_LS}:paths`, JSON.stringify(state.disabledAreaPaths));
	} catch {
		/* private mode / quota */
	}
}

/** Global area / life-mode filter shared across Fulcrum views. */
export const areaFilterState = writable<AreaFilterState>(readAreaFilterStateInitial());

export function setAreaFilterState(state: AreaFilterState): void {
	areaFilterState.set(state);
	persistAreaFilterState(state);
}

export function readAreaFilterPanelCollapsed(): boolean {
	try {
		return localStorage.getItem(AREA_FILTER_PANEL_COLLAPSED_LS) === "1";
	} catch {
		return false;
	}
}

export function setAreaFilterPanelCollapsed(collapsed: boolean): void {
	try {
		localStorage.setItem(AREA_FILTER_PANEL_COLLAPSED_LS, collapsed ? "1" : "0");
	} catch {
		/* ignore */
	}
}

/** @deprecated Use areaFilterState; kept for any external imports during transition. */
export const workRelatedOnly = writable(false);

/** @deprecated */
export function setWorkRelatedOnly(_value: boolean): void {
	/* no-op: replaced by area filter panel */
}

/** Incremented after each index rebuild so views refresh. */
export const indexRevision = writable(0);

export function bumpIndexRevision(): void {
	indexRevision.update((n: number) => n + 1);
}

/** Incremented after patchSettings so Svelte views re-read plugin.settings. */
export const settingsRevision = writable(0);

export function bumpSettingsRevision(): void {
	settingsRevision.update((n: number) => n + 1);
}

/** Incremented when timers start, stop, or entries change (timeline overlay refresh). */
export const timerRevision = writable(0);

export function bumpTimerRevision(): void {
	timerRevision.update((n: number) => n + 1);
}

/** True while a task is being dragged from the sidebar onto the calendar. */
export const calendarTaskDragActive = writable(false);

export function setCalendarTaskDragActive(active: boolean): void {
	calendarTaskDragActive.set(active);
}
