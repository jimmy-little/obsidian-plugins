import type {FulcrumSettings} from "../settingsDefaults";
import type {IndexedTask} from "../types";

export function displayTagsForTask(task: IndexedTask, settings: FulcrumSettings): string[] {
	const raw =
		task.source === "inline" && task.inlineTags?.length ? task.inlineTags : task.tags;
	if (!raw?.length) return [];
	if (!settings.taskSuppressDesignatedTagInDisplay) return [...raw];
	const designated = settings.taskTag.trim().toLowerCase().replace(/^#/, "");
	if (!designated) return [...raw];
	return raw.filter((t) => t.trim().toLowerCase().replace(/^#/, "") !== designated);
}
