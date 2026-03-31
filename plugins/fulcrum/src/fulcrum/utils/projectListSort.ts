import type {ProjectSidebarSortBy, ProjectSidebarSortDir} from "../settingsDefaults";
import type {IndexedProject} from "../types";

function parseDayMs(iso: string | undefined): number | null {
	if (!iso?.trim()) return null;
	const t = Date.parse(iso.slice(0, 10) + "T12:00:00");
	return Number.isNaN(t) ? null : t;
}

/** Missing dates sort after all real dates (both directions). */
function compareDates(
	a: IndexedProject,
	b: IndexedProject,
	field: "launchDate" | "nextReview",
	dir: "asc" | "desc",
): number {
	const ta = parseDayMs(a[field]);
	const tb = parseDayMs(b[field]);
	const ma = ta == null ? 1 : 0;
	const mb = tb == null ? 1 : 0;
	if (ma !== mb) return ma - mb;
	if (ta == null || tb == null) return 0;
	let c = ta - tb;
	if (dir === "desc") c = -c;
	return c;
}

function compareRank(a: IndexedProject, b: IndexedProject, dir: "asc" | "desc"): number {
	const ra = a.rank;
	const rb = b.rank;
	const na = ra == null || !Number.isFinite(ra) ? 1 : 0;
	const nb = rb == null || !Number.isFinite(rb) ? 1 : 0;
	if (na !== nb) return na - nb;
	if (ra == null || rb == null) return 0;
	let c = ra - rb;
	if (dir === "desc") c = -c;
	return c;
}

/**
 * Sort projects for sidebar/dashboard list. Higher rank is “more important” (use dir `desc` for that first).
 */
export function sortIndexedProjects(
	projects: IndexedProject[],
	sortBy: ProjectSidebarSortBy,
	dir: ProjectSidebarSortDir,
): IndexedProject[] {
	const out = [...projects];
	out.sort((a, b) => {
		let c = 0;
		if (sortBy === "launch") {
			c = compareDates(a, b, "launchDate", dir);
		} else if (sortBy === "nextReview") {
			c = compareDates(a, b, "nextReview", dir);
		} else if (sortBy === "name") {
			c = a.name.localeCompare(b.name, undefined, {sensitivity: "base"});
			if (dir === "desc") c = -c;
		} else {
			c = compareRank(a, b, dir);
		}
		if (c !== 0) return c;
		return a.name.localeCompare(b.name, undefined, {sensitivity: "base"});
	});
	return out;
}
