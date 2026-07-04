import {writable} from "svelte/store";

/** Scroll/focus target in center day grouping */
export const tasksViewFocusedIso = writable<string | null>(null);

/** Selected task row key (calendarTaskDragKey) */
export const tasksViewSelectedKey = writable<string | null>(null);
