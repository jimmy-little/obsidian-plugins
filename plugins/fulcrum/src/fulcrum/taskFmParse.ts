import type {FulcrumSettings} from "./settingsDefaults";
import type {RecurrenceAnchorMode, TaskAbsoluteReminder, TaskReminderSpec} from "./types";

export function fmStringArray(fm: Record<string, unknown> | undefined, key: string): string[] {
	if (!fm || !key) return [];
	const v = fm[key];
	if (Array.isArray(v)) {
		return v.map((x) => String(x).trim()).filter(Boolean);
	}
	if (typeof v === "string") {
		const t = v.trim();
		if (!t) return [];
		if (t.startsWith("[") && t.endsWith("]")) {
			try {
				const parsed = JSON.parse(t) as unknown;
				if (Array.isArray(parsed)) {
					return parsed.map((x) => String(x).trim()).filter(Boolean);
				}
			} catch {
				/* fall through */
			}
		}
		return t
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return [];
}

export function parseRecurrenceAnchor(raw: string | undefined): RecurrenceAnchorMode | undefined {
	if (!raw?.trim()) return undefined;
	const x = raw.trim().toLowerCase();
	if (x === "scheduled" || x === "done") return x;
	return undefined;
}

function parseReminderRow(row: unknown): TaskReminderSpec | null {
	if (!row || typeof row !== "object") return null;
	const o = row as Record<string, unknown>;
	const type = String(o.type ?? "").toLowerCase();
	if (type === "relative") {
		const anchor = String(o.anchor ?? "due").toLowerCase();
		const offset = Number(o.offset);
		const unit = String(o.unit ?? "days").toLowerCase();
		const direction = String(o.direction ?? "before").toLowerCase();
		if (!Number.isFinite(offset)) return null;
		return {
			type: "relative",
			anchor: anchor === "scheduled" ? "scheduled" : "due",
			offset,
			unit:
				unit === "minutes" || unit === "hours" || unit === "days" ? unit : "days",
			direction: direction === "after" ? "after" : "before",
			description: typeof o.description === "string" ? o.description : undefined,
		};
	}
	if (type === "absolute") {
		const date = typeof o.date === "string" ? o.date.trim() : "";
		if (!date) return null;
		const abs: TaskAbsoluteReminder = {
			type: "absolute",
			date,
			time: typeof o.time === "string" ? o.time : undefined,
			description: typeof o.description === "string" ? o.description : undefined,
		};
		return abs;
	}
	return null;
}

export function parseRemindersFromFm(
	fm: Record<string, unknown> | undefined,
	settings: FulcrumSettings,
): TaskReminderSpec[] {
	if (!fm) return [];
	const key = settings.taskRemindersField.trim() || "reminders";
	const raw = fm[key];
	if (!Array.isArray(raw)) return [];
	const out: TaskReminderSpec[] = [];
	for (const row of raw) {
		const parsed = parseReminderRow(row);
		if (parsed) out.push(parsed);
	}
	return out;
}

export function readTaskRecurrenceFields(
	fm: Record<string, unknown> | undefined,
	settings: FulcrumSettings,
): {
	recurrence?: string;
	recurrenceAnchor?: RecurrenceAnchorMode;
	completeInstances: string[];
	skippedInstances: string[];
	recurrenceParentPath?: string;
	occurrenceDate?: string;
} {
	if (!fm) {
		return {completeInstances: [], skippedInstances: []};
	}
	const recKey = settings.taskRecurrenceField.trim() || "recurrence";
	const anchorKey = settings.taskRecurrenceAnchorField.trim() || "recurrence_anchor";
	const completeKey = settings.taskCompleteInstancesField.trim() || "complete_instances";
	const skippedKey = settings.taskSkippedInstancesField.trim() || "skipped_instances";
	const parentKey = settings.taskRecurrenceParentField.trim() || "recurrence_parent";
	const occKey = settings.taskOccurrenceDateField.trim() || "occurrence_date";

	const recurrenceRaw = fm[recKey];
	const recurrence =
		typeof recurrenceRaw === "string" && recurrenceRaw.trim()
			? recurrenceRaw.trim()
			: undefined;

	return {
		recurrence,
		recurrenceAnchor: parseRecurrenceAnchor(
			typeof fm[anchorKey] === "string" ? fm[anchorKey] : undefined,
		),
		completeInstances: fmStringArray(fm, completeKey),
		skippedInstances: fmStringArray(fm, skippedKey),
		recurrenceParentPath:
			typeof fm[parentKey] === "string" ? fm[parentKey].trim() : undefined,
		occurrenceDate: typeof fm[occKey] === "string" ? fm[occKey].trim() : undefined,
	};
}
