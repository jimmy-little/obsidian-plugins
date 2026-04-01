import type {App} from "obsidian";
import type {IndexedArea, IndexedMeeting, IndexedProject, IndexedTask, IndexSnapshot} from "../types";

function fmString(fm: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!fm) return undefined;
	const v = fm[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

/** First matching key wins. `true` / `false` or common string forms. */
function fmBooleanLoose(
	fm: Record<string, unknown> | undefined,
	keys: string[],
): boolean | undefined {
	if (!fm) return undefined;
	for (const key of keys) {
		const v = fm[key];
		if (v === true) return true;
		if (v === false) return false;
		if (typeof v === "string") {
			const s = v.trim().toLowerCase();
			if (s === "true" || s === "yes" || s === "1") return true;
			if (s === "false" || s === "no" || s === "0") return false;
		}
	}
	return undefined;
}

export type BuildAreaWorkRelatedMapOptions = {
	/** When set with `app` and type keys, fills in `work-related` for linked area notes not present in `areas` (e.g. outside the areas folder). */
	projects?: IndexedProject[];
	app?: App;
	typeField?: string;
	areaTypeValue?: string;
};

/**
 * Map vault path → whether that area counts as work-related for filtering.
 * Optionally enriches from project→area links when an area note was not indexed under the areas folder.
 */
export function buildAreaWorkRelatedMap(
	areas: IndexedArea[],
	options?: BuildAreaWorkRelatedMapOptions,
): Map<string, boolean> {
	const m = new Map<string, boolean>();
	for (const a of areas) {
		m.set(a.file.path, a.workRelated === true);
	}
	const opt = options;
	if (opt?.projects && opt.app && opt.typeField && opt.areaTypeValue != null) {
		const tf = opt.typeField.trim();
		const areaLc = String(opt.areaTypeValue).toLowerCase();
		for (const p of opt.projects) {
			for (const af of p.areaFiles) {
				if (m.has(af.path)) continue;
				const cache = opt.app.metadataCache.getFileCache(af);
				const fm = cache?.frontmatter as Record<string, unknown> | undefined;
				const tVal = fmString(fm, tf)?.toLowerCase();
				if (tVal !== areaLc) continue;
				const wr = fmBooleanLoose(fm, ["work-related", "workRelated"]);
				m.set(af.path, wr === true);
			}
		}
	}
	return m;
}

/** True if the project links at least one indexed area with `workRelated: true`. */
export function projectIsWorkRelated(p: IndexedProject, areaWork: Map<string, boolean>): boolean {
	for (const af of p.areaFiles) {
		if (areaWork.get(af.path) === true) return true;
	}
	return false;
}

export function filterProjectsWorkRelated(
	projects: IndexedProject[],
	onlyWork: boolean,
	areaWork: Map<string, boolean>,
): IndexedProject[] {
	if (!onlyWork) return projects;
	return projects.filter((p) => projectIsWorkRelated(p, areaWork));
}

export function taskPassesWorkFilter(
	t: IndexedTask,
	snapshot: IndexSnapshot,
	onlyWork: boolean,
	areaWork: Map<string, boolean>,
): boolean {
	if (!onlyWork) return true;
	if (!t.projectFile) return false;
	const proj = snapshot.projects.find((p) => p.file.path === t.projectFile!.path);
	return proj != null && projectIsWorkRelated(proj, areaWork);
}

export function meetingPassesWorkFilter(
	m: IndexedMeeting,
	snapshot: IndexSnapshot,
	onlyWork: boolean,
	areaWork: Map<string, boolean>,
): boolean {
	if (!onlyWork) return true;
	const pf = m.projectFile;
	if (!pf) return false;
	const proj = snapshot.projects.find((p) => p.file.path === pf.path);
	return proj != null && projectIsWorkRelated(proj, areaWork);
}
