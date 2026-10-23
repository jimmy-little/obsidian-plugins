import type {App, TFile} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {reminderSyncHash} from "./hash";
import type {FulcrumReminder, RemindersSyncFingerprint} from "./types";

export function projectListIdField(settings: FulcrumSettings): string {
	return settings.conduitReminderListIdField.trim() || "appleReminderListId";
}

export function reminderIdField(settings: FulcrumSettings): string {
	return settings.appleReminderIdField.trim() || "appleReminderId";
}

export function reminderSyncHashField(settings: FulcrumSettings): string {
	return settings.appleReminderSyncHashField.trim() || "appleReminderSyncHash";
}

export function reminderSyncedAtField(settings: FulcrumSettings): string {
	return settings.appleReminderSyncedAtField.trim() || "appleReminderSyncedAt";
}

function fmString(fm: Record<string, unknown> | undefined, key: string): string | null {
	if (!fm) return null;
	const v = fm[key];
	if (typeof v === "string" && v.trim()) return v.trim();
	if (typeof v === "number" && Number.isFinite(v)) return String(v);
	return null;
}

function readFrontmatter(app: App, file: TFile): Record<string, unknown> | undefined {
	return app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
}

/** Parse a top-level YAML scalar (`key: value` / quoted) from note text. */
export function readYamlScalar(raw: string, key: string): string | null {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const m = raw.match(
		new RegExp(`^${escaped}:\\s*(?:["']([^"'\\n]+)["']|([^\\s#]+))\\s*(?:#.*)?$`, "m"),
	);
	return (m?.[1] ?? m?.[2])?.trim() || null;
}

export function readProjectListId(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): string | null {
	return fmString(readFrontmatter(app, project.file), projectListIdField(settings));
}

export type RemindersOpenTarget = "reminders" | "goodtask";

export function parseRemindersOpenTarget(value: unknown): RemindersOpenTarget {
	return value === "goodtask" ? "goodtask" : "reminders";
}

/** Deep link for the project header pill (Apple Reminders or GoodTask). */
export function remindersListOpenUrl(target: RemindersOpenTarget, projectName: string): string | null {
	if (target === "goodtask") {
		const name = projectName.trim();
		if (!name) return null;
		return `goodtask3://view?title=${encodeURIComponent(name)}`;
	}
	return "x-apple-reminderkit://";
}

export function readProjectRemindersOpenLink(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): {href: string; label: string; title: string} | null {
	if (!settings.conduitEnabled) return null;
	if (!readProjectListId(app, project, settings)) return null;
	const name = project.name.trim() || project.file.basename.replace(/\.md$/i, "");
	const target = parseRemindersOpenTarget(settings.remindersOpenTarget);
	const href = remindersListOpenUrl(target, name);
	if (!href) return null;
	const label = target === "goodtask" ? "GoodTask" : "Reminders";
	return {href, label, title: `Open in ${label} (${name})`};
}

export async function readProjectListIdFresh(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): Promise<string | null> {
	const cached = readProjectListId(app, project, settings);
	if (cached) return cached;
	const raw = await app.vault.read(project.file);
	return readYamlScalar(raw, projectListIdField(settings));
}

export async function writeProjectListId(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	listId: string | null,
): Promise<void> {
	const key = projectListIdField(settings);
	await app.fileManager.processFrontMatter(project.file, (fm) => {
		if (listId) fm[key] = listId;
		else delete fm[key];
	});
}

const INLINE_REMINDER_ID_RE = /<!--\s*reminder-id:\s*([^\s>]+)\s*-->/i;

export function readInlineReminderId(line: string): string | null {
	const m = line.match(INLINE_REMINDER_ID_RE);
	return m?.[1]?.trim() || null;
}

export function withInlineReminderId(line: string, id: string): string {
	if (INLINE_REMINDER_ID_RE.test(line)) {
		return line.replace(INLINE_REMINDER_ID_RE, `<!-- reminder-id: ${id} -->`);
	}
	return `${line.replace(/\s+$/, "")} <!-- reminder-id: ${id} -->`;
}

/** remctl stored numeric ids that cannot look up EventKit items. */
export function isLegacyNumericReminderId(id: string | null | undefined): boolean {
	return !!id && /^\d+$/.test(id.trim());
}

export function readTaskReminderId(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): string | null {
	const id = fmString(readFrontmatter(app, task.file), reminderIdField(settings));
	if (!id || isLegacyNumericReminderId(id)) return null;
	return id;
}

export function readStoredReminderHash(
	app: App,
	file: TFile,
	settings: FulcrumSettings,
): string | null {
	return fmString(readFrontmatter(app, file), reminderSyncHashField(settings));
}

export function vaultTaskFingerprint(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	listId: string | null,
): RemindersSyncFingerprint {
	const done = parseDoneStatusSet(settings.taskDoneStatuses);
	return {
		title: task.title,
		due: task.dueDate ?? null,
		completed: isDoneStatus(task.status, done),
		listId,
	};
}

export function reminderFingerprint(rem: FulcrumReminder): RemindersSyncFingerprint {
	return {
		title: rem.title,
		due: rem.dueDate ?? null,
		completed: rem.completed,
		listId: rem.listId ?? null,
	};
}

export function vaultTaskReminderHash(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	listId: string | null,
): string {
	return reminderSyncHash(vaultTaskFingerprint(app, task, settings, listId));
}

export async function writeTaskReminderSyncMeta(
	app: App,
	file: TFile,
	settings: FulcrumSettings,
	opts: {id?: string | null; hash: string},
): Promise<void> {
	const idKey = reminderIdField(settings);
	const hashKey = reminderSyncHashField(settings);
	const atKey = reminderSyncedAtField(settings);
	await app.fileManager.processFrontMatter(file, (fm) => {
		if (opts.id !== undefined) {
			if (opts.id) fm[idKey] = opts.id;
			else delete fm[idKey];
		}
		fm[hashKey] = opts.hash;
		fm[atKey] = new Date().toISOString();
	});
}
