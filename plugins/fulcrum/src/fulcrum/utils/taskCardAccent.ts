import type {FulcrumHost} from "../pluginBridge";
import type {IndexedTask} from "../types";
import {resolveProjectAccentCss} from "./projectVisual";

/** Left-border accent for a task card from its linked project. */
export function taskProjectAccentCss(host: FulcrumHost, task: IndexedTask): string {
	if (!task.projectFile) return "var(--interactive-accent)";
	const indexed = host.vaultIndex.resolveProjectByPath(task.projectFile.path);
	if (indexed?.color) return resolveProjectAccentCss(indexed.color);
	const cache = host.app.metadataCache.getFileCache(task.projectFile);
	const colorField = host.settings.projectColorField.trim() || "color";
	const raw = cache?.frontmatter?.[colorField];
	if (raw != null && String(raw).trim()) {
		return resolveProjectAccentCss(String(raw));
	}
	return "var(--interactive-accent)";
}
