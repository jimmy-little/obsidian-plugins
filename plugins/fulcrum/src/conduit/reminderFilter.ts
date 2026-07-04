import type {FulcrumReminder} from "./types";
import {todayLocalISODate} from "../fulcrum/utils/dates";

export interface ReminderQueryConfig {
	due?: string;
	tagsInclude?: string[];
	tags?: string[];
	list?: string;
	listId?: string;
	completed?: boolean;
	search?: string;
	limit?: number;
}

const KEY_VALUE = /^\s*([a-z][\w-]*)\s*:\s*(.+)$/i;

export function parseReminderQueryConfig(source: string): ReminderQueryConfig | null {
	const config: ReminderQueryConfig = {};
	let hasFilter = false;

	for (const line of source.split("\n")) {
		const m = line.match(KEY_VALUE);
		if (!m) continue;
		const key = m[1].trim().toLowerCase();
		const raw = m[2].trim();
		if (!raw) continue;

		switch (key) {
			case "due":
				config.due = raw.toLowerCase();
				hasFilter = true;
				break;
			case "tags":
			case "tag":
				config.tags = raw.split(/[,\s]+/).map(parseTag).filter(Boolean) as string[];
				hasFilter = true;
				break;
			case "tags include":
			case "tag include":
			case "tags_include":
				config.tagsInclude = raw.split(/[,\s]+/).map(parseTag).filter(Boolean) as string[];
				hasFilter = true;
				break;
			case "list":
				config.list = raw;
				hasFilter = true;
				break;
			case "list-id":
			case "list_id":
				config.listId = raw;
				hasFilter = true;
				break;
			case "completed":
				config.completed = /^(true|1|yes)$/i.test(raw);
				hasFilter = true;
				break;
			case "search":
				config.search = raw;
				hasFilter = true;
				break;
			case "limit":
				{
					const n = Number.parseInt(raw, 10);
					if (Number.isFinite(n) && n > 0) config.limit = n;
				}
				break;
			case "name":
				break;
			default:
				break;
		}
	}

	if (!hasFilter && config.limit == null) return null;
	return config;
}

function parseTag(raw: string): string | null {
	const t = raw.trim().replace(/^#/, "");
	return t.length > 0 ? t.toLowerCase() : null;
}

function dueDateOnly(iso: string | null | undefined): string | null {
	if (!iso?.trim()) return null;
	return iso.trim().slice(0, 10);
}

function matchesDue(reminder: FulcrumReminder, due: string): boolean {
	const d = dueDateOnly(reminder.dueDate);
	const today = todayLocalISODate();

	switch (due) {
		case "today":
			return d === today;
		case "tomorrow": {
			const t = new Date();
			t.setDate(t.getDate() + 1);
			const y = t.getFullYear();
			const mo = String(t.getMonth() + 1).padStart(2, "0");
			const day = String(t.getDate()).padStart(2, "0");
			return d === `${y}-${mo}-${day}`;
		}
		case "overdue":
			return d != null && d < today && !reminder.completed;
		case "none":
			return d == null;
		default:
			if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return d === due;
			return false;
	}
}

function reminderTagsLower(reminder: FulcrumReminder): string[] {
	return reminder.tags.map((t) => t.toLowerCase().replace(/^#/, ""));
}

export function filterReminders(
	reminders: FulcrumReminder[],
	config: ReminderQueryConfig,
): FulcrumReminder[] {
	let rows = [...reminders];

	if (config.completed === true) {
		rows = rows.filter((r) => r.completed);
	} else if (config.completed === false) {
		rows = rows.filter((r) => !r.completed);
	}

	if (config.due) {
		rows = rows.filter((r) => matchesDue(r, config.due!));
	}

	if (config.listId) {
		const id = config.listId.trim();
		rows = rows.filter((r) => r.listId === id);
	} else if (config.list) {
		const name = config.list.trim().toLowerCase();
		rows = rows.filter((r) => (r.listName ?? "").toLowerCase() === name);
	}

	if (config.tagsInclude?.length) {
		rows = rows.filter((r) => {
			const tags = reminderTagsLower(r);
			return config.tagsInclude!.every((t) => tags.includes(t));
		});
	}

	if (config.tags?.length) {
		rows = rows.filter((r) => {
			const tags = reminderTagsLower(r);
			return config.tags!.some((t) => tags.includes(t));
		});
	}

	if (config.search?.trim()) {
		const q = config.search.trim().toLowerCase();
		rows = rows.filter(
			(r) =>
				r.title.toLowerCase().includes(q) ||
				r.notes.toLowerCase().includes(q) ||
				(r.listName ?? "").toLowerCase().includes(q),
		);
	}

	rows.sort((a, b) => {
		const ad = dueDateOnly(a.dueDate) ?? "9999-99-99";
		const bd = dueDateOnly(b.dueDate) ?? "9999-99-99";
		if (ad !== bd) return ad.localeCompare(bd);
		return a.title.localeCompare(b.title);
	});

	if (config.limit != null && config.limit > 0) {
		rows = rows.slice(0, config.limit);
	}

	return rows;
}

export function summarizeReminderQuery(config: ReminderQueryConfig): string {
	const parts: string[] = [];
	if (config.due) parts.push(`due: ${config.due}`);
	if (config.tagsInclude?.length) parts.push(`tags: ${config.tagsInclude.map((t) => `#${t}`).join(", ")}`);
	if (config.list) parts.push(`list: ${config.list}`);
	if (config.completed === false) parts.push("open");
	if (config.completed === true) parts.push("completed");
	if (config.search) parts.push(`search: ${config.search}`);
	return parts.length > 0 ? parts.join(" · ") : "all reminders";
}
