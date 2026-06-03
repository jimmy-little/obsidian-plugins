import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {parseList, type FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {RemctlReminderRow} from "./types";
import {taskVaultKey} from "./vaultKeys";

export function vaultFingerprint(
	projects: IndexedProject[],
	tasks: IndexedTask[],
	settings: FulcrumSettings,
): string {
	const done = new Set(parseList(settings.taskDoneStatuses));
	const parts: string[] = [];
	for (const p of projects) {
		parts.push(`p:${p.file.path}:${p.status}:${p.name}`);
	}
	for (const t of tasks) {
		const doneFlag = done.has(t.status.toLowerCase()) ? "1" : "0";
		parts.push(
			`t:${taskVaultKey(t)}:${t.title}:${t.status}:${t.dueDate ?? ""}:${doneFlag}:${t.file.stat.mtime}`,
		);
	}
	parts.sort();
	return simpleHash(parts.join("\n"));
}

export function remindersFingerprint(rows: RemctlReminderRow[]): string {
	const parts = rows.map(
		(r) => `${r.numericId}:${r.title}:${r.completed}:${r.dueDate ?? ""}:${r.lastModified}`,
	);
	parts.sort();
	return simpleHash(parts.join("\n"));
}

function simpleHash(s: string): string {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	}
	return `${h}:${s.length}`;
}
