import {
	formatShortMonthDay,
	isDueToday,
	isOverdue,
	todayLocalISODate,
} from "./dates";

export function priorityAccentCss(priority: string | undefined): string {
	if (!(priority != null && priority.trim())) return "var(--text-muted)";
	const p = priority.trim().toLowerCase();
	if (/^(high|urgent|critical|highest|p1|1|h)$/u.test(p)) return "#e74c3c";
	if (/^(medium|normal|med|p2|2|m)$/u.test(p)) return "#f39c12";
	if (/^(low|p3|p4|3|4|l)$/u.test(p)) return "#5dade2";
	return "var(--text-muted)";
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
