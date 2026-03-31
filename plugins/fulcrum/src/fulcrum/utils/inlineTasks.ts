/** Title text from a markdown checkbox line, or null if not a task line. */
export function parseCheckboxLineTitle(line: string): string | null {
	const m = line.match(/^\s*[-*+]\s*\[[^\]]*\]\s*(.*)$/);
	if (!m) return null;
	return m[1]?.trim() ?? "";
}

/** Flip `[ ]` ↔ `[x]` on a checkbox line; null if not a checkbox line. */
export function flipMarkdownCheckboxLine(line: string): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const inner = m[2];
	const next = inner === " " || inner === "" ? "x" : " ";
	return `${m[1]}[${next}]${m[3]}`;
}

/**
 * Due / scheduled on a checkbox line: Obsidian Tasks emojis, Dataview `[due::]` fields,
 * and legacy ⏫ scheduled. Scheduled uses ⏳ (Tasks default) and ⏫.
 */
export function parseObsidianTasksEmojiDates(line: string): {
	title: string;
	dueDate?: string;
	scheduledDate?: string;
} {
	const dues: string[] = [];
	const sched: string[] = [];

	function pushDue(iso: string): void {
		if (/^\d{4}-\d{2}-\d{2}$/u.test(iso)) dues.push(iso);
	}
	function pushSched(iso: string): void {
		if (/^\d{4}-\d{2}-\d{2}$/u.test(iso)) sched.push(iso);
	}

	for (const m of line.matchAll(/(?:📅|⏰|📆)\s*(\d{4}-\d{2}-\d{2})/gu)) {
		if (m[1]) pushDue(m[1]);
	}
	for (const m of line.matchAll(/(?:⏳|⏫)\s*(\d{4}-\d{2}-\d{2})/gu)) {
		if (m[1]) pushSched(m[1]);
	}
	for (const m of line.matchAll(/\[due::\s*(\d{4}-\d{2}-\d{2})\s*\]/giu)) {
		if (m[1]) pushDue(m[1]);
	}
	for (const m of line.matchAll(/\[scheduled::\s*(\d{4}-\d{2}-\d{2})\s*\]/giu)) {
		if (m[1]) pushSched(m[1]);
	}
	for (const m of line.matchAll(/(?:^|[\s,])due::\s*(\d{4}-\d{2}-\d{2})/giu)) {
		if (m[1]) pushDue(m[1]);
	}
	for (const m of line.matchAll(/(?:^|[\s,])scheduled::\s*(\d{4}-\d{2}-\d{2})/giu)) {
		if (m[1]) pushSched(m[1]);
	}

	let t = line
		.replace(/(?:📅|⏰|📆)\s*\d{4}-\d{2}-\d{2}/gu, " ")
		.replace(/(?:⏳|⏫)\s*\d{4}-\d{2}-\d{2}/gu, " ")
		.replace(/\[due::\s*\d{4}-\d{2}-\d{2}\s*\]/giu, " ")
		.replace(/\[scheduled::\s*\d{4}-\d{2}-\d{2}\s*\]/giu, " ")
		.replace(/(?:^|[\s,])due::\s*\d{4}-\d{2}-\d{2}/giu, " ")
		.replace(/(?:^|[\s,])scheduled::\s*\d{4}-\d{2}-\d{2}/giu, " ")
		.replace(/\s+/gu, " ")
		.trim();

	return {
		title: t,
		dueDate: dues[0],
		scheduledDate: sched[0],
	};
}
