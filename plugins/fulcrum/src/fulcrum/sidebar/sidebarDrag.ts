import type {IndexedProject} from "../types";

export const FULCRUM_SIDEBAR_PROJECT_MIME = "application/x-fulcrum-sidebar-kanban-project+json";

export function projectDragKey(project: IndexedProject): string {
	return JSON.stringify({path: project.file.path});
}

export function findProjectByDragKey(
	projects: IndexedProject[],
	key: string,
): IndexedProject | undefined {
	try {
		const parsed = JSON.parse(key) as {path?: string};
		if (!parsed.path) return undefined;
		return projects.find((p) => p.file.path === parsed.path);
	} catch {
		return undefined;
	}
}
