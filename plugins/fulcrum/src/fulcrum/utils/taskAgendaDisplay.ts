import {
	formatShortMonthDay,
	isDueToday,
	isOverdue,
	todayLocalISODate,
} from "./dates";

const STATUS_RING_OVERDUE = "#e74c3c";
const STATUS_RING_HIGH = "#f39c12";
const STATUS_RING_MEDIUM = "#3498db";
const STATUS_RING_LOW = "#9b59b6";

export function priorityAccentCss(priority: string | undefined): string {
	if (!(priority != null && priority.trim())) return "var(--text-muted)";
	const p = priority.trim().toLowerCase();
	if (/^(high|urgent|critical|highest|p1|1|h)$/u.test(p)) return STATUS_RING_HIGH;
	if (/^(medium|normal|med|p2|2|m)$/u.test(p)) return STATUS_RING_MEDIUM;
	if (/^(low|p3|p4|3|4|l)$/u.test(p)) return STATUS_RING_LOW;
	return "var(--text-muted)";
}

/** Status-ring border: overdue wins over priority; done uses CSS --done styling. */
export function taskStatusRingCss(
	task: {dueDate?: string; priority?: string},
	done: boolean,
): string {
	if (done) return "var(--text-muted)";
	if (isOverdue(task.dueDate, false)) return STATUS_RING_OVERDUE;
	return priorityAccentCss(task.priority);
}

export function dueChip(
	due: string | undefined,
	done: boolean,
): {text: string; kind: "none" | "overdue" | "today" | "due"} {
	if (!(due != null && due.trim()) || done) return {text: "", kind: "none"};
	const t = formatShortMonthDay(due);
	if (isOverdue(due, false)) return {text: `${t} (overdue)`, kind: "overdue"};
	if (isDueToday(due, false)) return {text: `${t} (today)`, kind: "today"};
	return {text: t, kind: "due"};
}

export function scheduledChip(
	scheduled: string | undefined,
	done: boolean,
): {text: string; kind: "none" | "past" | "today" | "scheduled"} {
	if (!(scheduled != null && scheduled.trim()) || done) return {text: "", kind: "none"};
	const d = scheduled.slice(0, 10);
	const t = formatShortMonthDay(scheduled);
	const today = todayLocalISODate();
	if (d < today) return {text: `${t} (past)`, kind: "past"};
	if (d === today) return {text: `${t} (today)`, kind: "today"};
	return {text: t, kind: "scheduled"};
}
