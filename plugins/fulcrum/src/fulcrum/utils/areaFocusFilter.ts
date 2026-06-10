import type {App} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import type {IndexedArea, IndexedMeeting, IndexedProject, IndexedTask, IndexSnapshot} from "../types";
import {resolveProjectAccentCss} from "./projectVisual";

const LIFE_MODE_FM_KEYS = ["life-mode", "lifeMode", "life_mode"] as const;

/** Display order for life-mode section headers in the filter panel. */
export const LIFE_MODE_SECTION_ORDER = [
	"work",
	"professional",
	"freelance",
	"personal",
	"other",
] as const;

export type AreaFilterState = {
	/** Normalized life-mode keys with entire sections turned off. */
	disabledLifeModes: string[];
	/** Area vault paths turned off while their section is on. */
	disabledAreaPaths: string[];
};

export type AreaFilterPanelArea = {
	path: string;
	name: string;
	colorCss: string;
	icon?: string;
	enabled: boolean;
};

export type AreaFilterPanelGroup = {
	lifeModeKey: string;
	label: string;
	sectionEnabled: boolean;
	areas: AreaFilterPanelArea[];
};

function fmString(fm: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!fm) return undefined;
	const v = fm[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

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

/** Strip `[[wikilinks]]` and alias pipes for display / grouping keys. */
export function stripWikiMarkupForDisplay(s: string): string {
	return s
		.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
		.replace(/^\[\[|\]\]$/g, "")
		.trim();
}

/** Stable key for filter state (lowercase, trimmed). */
export function normalizeLifeModeKey(raw: string | undefined | null): string {
	if (raw == null || !String(raw).trim()) return "other";
	return stripWikiMarkupForDisplay(String(raw)).toLowerCase();
}

/** Title-case label for section headers and buttons. */
export function formatLifeModeLabel(lifeModeKey: string): string {
	if (lifeModeKey === "other") return "Other";
	const display = stripWikiMarkupForDisplay(lifeModeKey);
	return display
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function sanitizeLifeModeValue(raw: string): string {
	return stripWikiMarkupForDisplay(raw);
}

export function readLifeModeFromFrontmatter(
	fm: Record<string, unknown> | undefined,
	settings: Pick<FulcrumSettings, "areaLifeModeField">,
): string | undefined {
	if (!fm) return undefined;
	const custom = settings.areaLifeModeField.trim();
	const keys = custom ? [custom, ...LIFE_MODE_FM_KEYS] : [...LIFE_MODE_FM_KEYS];
	for (const key of keys) {
		const v = fmString(fm, key);
		if (v?.trim()) return sanitizeLifeModeValue(v);
	}
	const wr = fmBooleanLoose(fm, ["work-related", "workRelated"]);
	if (wr === true) return "Work";
	if (wr === false) return "Personal";
	return undefined;
}

export function resolveIndexedAreaLifeMode(
	area: IndexedArea,
	settings: Pick<FulcrumSettings, "areaLifeModeField">,
): string {
	if (area.lifeMode?.trim()) return sanitizeLifeModeValue(area.lifeMode);
	return "Other";
}

export type BuildAreaLifeModeMapOptions = {
	projects?: IndexedProject[];
	app?: App;
	typeField?: string;
	areaTypeValue?: string;
	settings: Pick<FulcrumSettings, "areaLifeModeField">;
};

/** Map vault path → life-mode label (display form) for every known area note. */
export function buildAreaLifeModeMap(
	areas: IndexedArea[],
	options: BuildAreaLifeModeMapOptions,
): Map<string, string> {
	const m = new Map<string, string>();
	for (const a of areas) {
		m.set(a.file.path, resolveIndexedAreaLifeMode(a, options.settings));
	}
	const opt = options;
	if (opt.projects && opt.app && opt.typeField && opt.areaTypeValue != null) {
		const tf = opt.typeField.trim();
		const areaLc = String(opt.areaTypeValue).toLowerCase();
		for (const p of opt.projects) {
			for (const af of p.areaFiles) {
				if (m.has(af.path)) continue;
				const cache = opt.app.metadataCache.getFileCache(af);
				const fm = cache?.frontmatter as Record<string, unknown> | undefined;
				const tVal = fmString(fm, tf)?.toLowerCase();
				if (tVal !== areaLc) continue;
				const lm =
					readLifeModeFromFrontmatter(fm, opt.settings) ??
					(fmBooleanLoose(fm, ["work-related", "workRelated"]) === true
						? "Work"
						: "Other");
				m.set(af.path, sanitizeLifeModeValue(lm));
			}
		}
	}
	return m;
}

export function isAreaFilterWideOpen(state: AreaFilterState): boolean {
	return state.disabledLifeModes.length === 0 && state.disabledAreaPaths.length === 0;
}

export function lifeModeSectionEnabled(lifeModeKey: string, state: AreaFilterState): boolean {
	return !state.disabledLifeModes.includes(normalizeLifeModeKey(lifeModeKey));
}

export function areaPathEnabled(
	path: string,
	lifeModeKey: string,
	state: AreaFilterState,
): boolean {
	if (!lifeModeSectionEnabled(lifeModeKey, state)) return false;
	return !state.disabledAreaPaths.includes(path);
}

export function projectPassesAreaFilter(
	p: IndexedProject,
	state: AreaFilterState,
	lifeModeMap: Map<string, string>,
): boolean {
	if (isAreaFilterWideOpen(state)) return true;
	if (p.areaFiles.length === 0) return false;
	for (const af of p.areaFiles) {
		const lm = lifeModeMap.get(af.path) ?? "Other";
		if (areaPathEnabled(af.path, lm, state)) return true;
	}
	return false;
}

export function filterProjectsByAreaFocus(
	projects: IndexedProject[],
	state: AreaFilterState,
	lifeModeMap: Map<string, string>,
): IndexedProject[] {
	if (isAreaFilterWideOpen(state)) return projects;
	return projects.filter((p) => projectPassesAreaFilter(p, state, lifeModeMap));
}

export type TaskAreaFilterOptions = {
	/** When true, tasks without a project link still show (Timeline personal / vault tasks). */
	includeUnlinked?: boolean;
};

export function taskPassesAreaFilter(
	t: IndexedTask,
	snapshot: IndexSnapshot,
	state: AreaFilterState,
	lifeModeMap: Map<string, string>,
	options?: TaskAreaFilterOptions,
): boolean {
	if (isAreaFilterWideOpen(state)) return true;
	if (t.areaFile) {
		const lm = lifeModeMap.get(t.areaFile.path) ?? "Other";
		return areaPathEnabled(t.areaFile.path, lm, state);
	}
	if (!t.projectFile) return options?.includeUnlinked === true;
	const proj = snapshot.projects.find((p) => p.file.path === t.projectFile!.path);
	return proj != null && projectPassesAreaFilter(proj, state, lifeModeMap);
}

export function meetingPassesAreaFilter(
	m: IndexedMeeting,
	snapshot: IndexSnapshot,
	state: AreaFilterState,
	lifeModeMap: Map<string, string>,
): boolean {
	if (isAreaFilterWideOpen(state)) return true;
	const pf = m.projectFile;
	if (!pf) return false;
	const proj = snapshot.projects.find((p) => p.file.path === pf.path);
	return proj != null && projectPassesAreaFilter(proj, state, lifeModeMap);
}

export type QuickStartAreaFilterInput = {
	projectSourcePath?: string | null;
	area?: string | null;
};

/** Match a display label (template frontmatter or resolved area name) to an indexed area path. */
export function resolveAreaPathFromDisplayLabel(
	label: string,
	snapshot: IndexSnapshot,
): string | null {
	const key = stripWikiMarkupForDisplay(label).toLowerCase();
	if (!key) return null;
	for (const a of snapshot.areas) {
		const nameKey = a.name.toLowerCase();
		const baseKey = a.file.basename.replace(/\.md$/i, "").toLowerCase();
		if (nameKey === key || baseKey === key) return a.file.path;
	}
	return null;
}

export function quickStartPassesAreaFilter(
	item: QuickStartAreaFilterInput,
	snapshot: IndexSnapshot,
	state: AreaFilterState,
	lifeModeMap: Map<string, string>,
): boolean {
	if (isAreaFilterWideOpen(state)) return true;

	if (item.projectSourcePath) {
		const proj = snapshot.projects.find((p) => p.file.path === item.projectSourcePath);
		if (proj) return projectPassesAreaFilter(proj, state, lifeModeMap);
	}

	if (item.area?.trim()) {
		const areaPath = resolveAreaPathFromDisplayLabel(item.area, snapshot);
		if (areaPath) {
			const lm = lifeModeMap.get(areaPath) ?? "Other";
			return areaPathEnabled(areaPath, lm, state);
		}
	}

	return false;
}

export function buildAreaFilterPanelGroups(
	areas: IndexedArea[],
	state: AreaFilterState,
	settings: Pick<FulcrumSettings, "areaLifeModeField">,
): AreaFilterPanelGroup[] {
	const byMode = new Map<string, AreaFilterPanelArea[]>();
	for (const a of areas) {
		const lifeMode = resolveIndexedAreaLifeMode(a, settings);
		const key = normalizeLifeModeKey(lifeMode);
		const list = byMode.get(key) ?? [];
		list.push({
			path: a.file.path,
			name: a.name,
			colorCss: resolveProjectAccentCss(a.color),
			icon: a.icon,
			enabled: areaPathEnabled(a.file.path, lifeMode, state),
		});
		byMode.set(key, list);
	}
	for (const list of byMode.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}));
	}
	const keys = new Set(byMode.keys());
	const ordered: string[] = [];
	for (const k of LIFE_MODE_SECTION_ORDER) {
		if (keys.has(k)) {
			ordered.push(k);
			keys.delete(k);
		}
	}
	ordered.push(...[...keys].sort());
	return ordered.map((lifeModeKey) => {
		const sectionEnabled = lifeModeSectionEnabled(lifeModeKey, state);
		return {
			lifeModeKey,
			label: formatLifeModeLabel(lifeModeKey),
			sectionEnabled,
			areas: byMode.get(lifeModeKey) ?? [],
		};
	});
}
