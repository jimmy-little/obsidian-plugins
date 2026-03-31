import type {IndexSnapshot, IndexedProject} from "../types";
import {daysUntilCalendar, isDateInUpcomingDays} from "./dates";

/** Same logic as the project sidebar: open tasks + meetings in the next 7 days per project path. */
export function buildProjectSidebarCounts(
	snapshot: IndexSnapshot,
	doneTask: Set<string>,
): Map<string, {openTasks: number; upcomingMeetings: number}> {
	const m = new Map<string, {openTasks: number; upcomingMeetings: number}>();
	for (const proj of snapshot.projects) {
		m.set(proj.file.path, {openTasks: 0, upcomingMeetings: 0});
	}
	for (const t of snapshot.tasks) {
		if (!t.projectFile) continue;
		const cur = m.get(t.projectFile.path);
		if (!cur) continue;
		if (!doneTask.has((t.status ?? "").trim().toLowerCase()) && !t.completedDate?.trim()) {
			cur.openTasks++;
		}
	}
	for (const mt of snapshot.meetings) {
		if (!mt.projectFile) continue;
		const cur = m.get(mt.projectFile.path);
		if (!cur) continue;
		if (isDateInUpcomingDays(mt.date, 7)) {
			cur.upcomingMeetings++;
		}
	}
	return m;
}

/** Matches sidebar “review overdue” (glasses) indicator. */
export function projectReviewIsOverdue(project: IndexedProject): boolean {
	if (!project.nextReview?.trim()) return false;
	const d = daysUntilCalendar(project.nextReview);
	return d !== null && d < 0;
}
