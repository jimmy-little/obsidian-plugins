import type {IndexedArea, IndexedMeeting, IndexedProject, IndexedTask, IndexSnapshot} from "../types";

export function buildAreaWorkRelatedMap(areas: IndexedArea[]): Map<string, boolean> {
	const m = new Map<string, boolean>();
	for (const a of areas) {
		m.set(a.file.path, a.workRelated === true);
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
