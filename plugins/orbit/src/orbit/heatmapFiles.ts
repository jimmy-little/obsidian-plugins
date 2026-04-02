import {toISODateLocal, type HeatmapDayFileRef} from "@obsidian-suite/heatmap";
import type {InteractionEntry} from "./interactions";

/** One row per vault file per day (deduped by path). */
export function filesByDayFromActivity(activity: InteractionEntry[]): Map<string, HeatmapDayFileRef[]> {
	const outer = new Map<string, Map<string, HeatmapDayFileRef>>();
	for (const row of activity) {
		const key = toISODateLocal(new Date(row.dateMs));
		if (!outer.has(key)) outer.set(key, new Map());
		const inner = outer.get(key)!;
		const path = row.file.path;
		const title = row.kind === "quick" ? `Quick note · ${row.file.basename}` : row.file.basename;
		inner.set(path, {path, title});
	}
	return new Map([...outer].map(([k, v]) => [k, [...v.values()]]));
}
