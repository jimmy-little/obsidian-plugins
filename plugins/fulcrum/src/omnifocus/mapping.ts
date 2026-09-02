import type {App, TFile} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
import type {SyncFingerprint} from "./types";
import {syncHash} from "./hash";

export function projectIdField(settings: FulcrumSettings): string {
	return settings.omnifocusProjectIdField.trim() || "omnifocusProjectId";
}

/** Deep link to open a linked OmniFocus project (stored id is the OmniFocus primary key). */
export function omnifocusProjectOpenUrl(projectId: string): string | null {
	const id = projectId.trim();
	if (!id) return null;
	if (/^omnifocus:\/\//i.test(id)) return id;
	return `omnifocus:///task/${id}`;
}

export function readProjectOmniFocusLink(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): {href: string; id: string} | null {
	const id = readProjectOmniId(app, project, settings);
	if (!id) return null;
	const href = omnifocusProjectOpenUrl(id);
	return href ? {href, id} : null;
}

export function taskIdField(settings: FulcrumSettings): string {
	return settings.omnifocusTaskIdField.trim() || "omnifocusTaskId";
}

export function syncedAtField(settings: FulcrumSettings): string {
	return settings.omnifocusSyncedAtField.trim() || "omnifocusSyncedAt";
}

export function syncHashField(settings: FulcrumSettings): string {
	return settings.omnifocusSyncHashField.trim() || "omnifocusSyncHash";
}

function fmString(fm: Record<string, unknown> | undefined, key: string): string | null {
	if (!fm) return null;
	const v = fm[key];
	if (typeof v === "string" && v.trim()) return v.trim();
	if (typeof v === "number") return String(v);
	return null;
}

export function readFrontmatter(
	app: App,
	file: TFile,
): Record<string, unknown> | undefined {
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

export function readProjectOmniId(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): string | null {
	return fmString(readFrontmatter(app, project.file), projectIdField(settings));
}

/** Cache can lag `processFrontMatter`; fall back to the file text. */
export async function readProjectOmniIdFresh(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): Promise<string | null> {
	const cached = readProjectOmniId(app, project, settings);
	if (cached) return cached;
	// cachedRead / metadataCache can lag processFrontMatter; read the file.
	const raw = await app.vault.read(project.file);
	return readYamlScalar(raw, projectIdField(settings));
}

const INLINE_OF_ID_RE = /<!--\s*omnifocus-id:\s*([^\s>]+)\s*-->/i;

export function readInlineOmniId(line: string): string | null {
	const m = line.match(INLINE_OF_ID_RE);
	return m?.[1]?.trim() || null;
}

export function withInlineOmniId(line: string, id: string): string {
	if (INLINE_OF_ID_RE.test(line)) {
		return line.replace(INLINE_OF_ID_RE, `<!-- omnifocus-id: ${id} -->`);
	}
	return `${line.replace(/\s+$/, "")} <!-- omnifocus-id: ${id} -->`;
}

export function readTaskOmniId(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): string | null {
	return fmString(readFrontmatter(app, task.file), taskIdField(settings));
}

export function readStoredHash(
	app: App,
	file: TFile,
	settings: FulcrumSettings,
): string | null {
	return fmString(readFrontmatter(app, file), syncHashField(settings));
}

export async function writeProjectOmniId(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	id: string | null,
): Promise<void> {
	const key = projectIdField(settings);
	await app.fileManager.processFrontMatter(project.file, (fm) => {
		if (id) fm[key] = id;
		else delete fm[key];
	});
}

export function vaultTaskFingerprint(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	projectOmniId: string | null,
): SyncFingerprint {
	const done = parseDoneStatusSet(settings.taskDoneStatuses);
	return {
		title: task.title,
		due: task.dueDate ?? null,
		defer: task.scheduledDate ?? null,
		completed: isDoneStatus(task.status, done),
		projectId: projectOmniId,
	};
}

export function ofTaskFingerprint(task: {
	name: string;
	due?: string | null;
	defer?: string | null;
	completed: boolean;
	projectId?: string | null;
}): SyncFingerprint {
	return {
		title: task.name,
		due: task.due ?? null,
		defer: task.defer ?? null,
		completed: task.completed,
		projectId: task.projectId ?? null,
	};
}

export function vaultTaskHash(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	projectOmniId: string | null,
): string {
	return syncHash(vaultTaskFingerprint(app, task, settings, projectOmniId));
}

export async function writeTaskSyncMeta(
	app: App,
	file: TFile,
	settings: FulcrumSettings,
	opts: {id?: string | null; hash: string},
): Promise<void> {
	const idKey = taskIdField(settings);
	const hashKey = syncHashField(settings);
	const atKey = syncedAtField(settings);
	await app.fileManager.processFrontMatter(file, (fm) => {
		if (opts.id !== undefined) {
			if (opts.id) fm[idKey] = opts.id;
			else delete fm[idKey];
		}
		fm[hashKey] = opts.hash;
		fm[atKey] = new Date().toISOString();
	});
}
