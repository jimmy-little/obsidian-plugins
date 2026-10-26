import {Notice, TFile, type WorkspaceLeaf} from "obsidian";
import {FULCRUM_CALENDAR_TASK_MIME, findTaskByDragKey} from "../calendar/calendarTaskSchedule";
import {formatLocalIsoDateTime} from "../calendar/isoDateTime";
import {applyTaskScheduledOnlyChange} from "../kanban/taskFieldUpdate";
import {createOrScheduleJiraTaskNote} from "../jira/jiraTaskImport";
import type {FulcrumHost} from "../pluginBridge";
import type {AtomicNoteRow} from "../types";

/** Dragging an Atomic note row (kind `"note"`) onto a Today time slot. */
export const FULCRUM_NOTE_DRAG_MIME = "application/x-fulcrum-note+json";

export function noteDragKey(note: AtomicNoteRow): string {
	return JSON.stringify({path: note.file.path});
}

function findNoteFileByDragKey(host: FulcrumHost, key: string): TFile | null {
	try {
		const parsed = JSON.parse(key) as {path?: string};
		if (!parsed.path) return null;
		const f = host.app.vault.getAbstractFileByPath(parsed.path);
		return f instanceof TFile ? f : null;
	} catch {
		return null;
	}
}

/** Dragging a Jira ticket/comment row onto a Today time slot. */
export const FULCRUM_JIRA_DRAG_MIME = "application/x-fulcrum-jira+json";

export function jiraDragKey(issueKey: string): string {
	return JSON.stringify({issueKey});
}

function parseJiraDragKey(key: string): string | null {
	try {
		const parsed = JSON.parse(key) as {issueKey?: string};
		return parsed.issueKey?.trim() || null;
	} catch {
		return null;
	}
}

/** The three MIME types a Today time row accepts a drop from. */
export function acceptsTodayTimeDrop(types: DOMStringList | string[] | undefined | null): boolean {
	if (!types) return false;
	const list = Array.from(types);
	return (
		list.includes(FULCRUM_CALENDAR_TASK_MIME) ||
		list.includes(FULCRUM_NOTE_DRAG_MIME) ||
		list.includes(FULCRUM_JIRA_DRAG_MIME)
	);
}

function notifyError(e: unknown, fallback: string): void {
	console.error(e);
	const msg = e instanceof Error ? e.message : String(e);
	new Notice(msg.length < 160 ? msg : fallback);
}

/** No frontmatter-field setting exists for Atomic notes (unlike tasks) — `startTime` is the literal
 *  key `VaultIndex` reads for time-of-day; writing it here is what `noteTiming()` in todayFeed.ts
 *  already prioritizes over a bare `date`, so this only ever changes the time, never the day. */
async function rescheduleNoteTime(host: FulcrumHost, file: TFile, exactIso: string): Promise<void> {
	await host.app.fileManager.processFrontMatter(file, (fm) => {
		fm.startTime = exactIso;
	});
}

/**
 * Handles a drop onto any Today timeline row (a real item or an hourly filler marker) — every such
 * row represents an exact clock time on `dateIso`. Dropping a task sets its scheduled date+time;
 * dropping a note sets its start time; dropping a Jira ticket/comment creates (or reschedules) its
 * linked task note. Never writes back to Jira.
 */
export async function handleTodayTimeDrop(
	ev: DragEvent,
	host: FulcrumHost,
	dateIso: string,
	startMinutes: number,
	anchorLeaf?: WorkspaceLeaf,
): Promise<void> {
	const dt = ev.dataTransfer;
	if (!dt) return;
	const exactIso = formatLocalIsoDateTime(dateIso, startMinutes);

	const taskKey = dt.getData(FULCRUM_CALENDAR_TASK_MIME);
	if (taskKey) {
		const task = findTaskByDragKey(host.vaultIndex.getSnapshot().tasks, taskKey);
		if (!task) return;
		try {
			await applyTaskScheduledOnlyChange(host.app, task, host.settings, exactIso);
			await host.refreshIndex();
		} catch (e) {
			notifyError(e, "Could not reschedule task.");
		}
		return;
	}

	const noteKey = dt.getData(FULCRUM_NOTE_DRAG_MIME);
	if (noteKey) {
		const file = findNoteFileByDragKey(host, noteKey);
		if (!file) return;
		try {
			await rescheduleNoteTime(host, file, exactIso);
			await host.refreshIndex();
		} catch (e) {
			notifyError(e, "Could not reschedule note.");
		}
		return;
	}

	const jiraKey = dt.getData(FULCRUM_JIRA_DRAG_MIME);
	if (jiraKey) {
		const issueKey = parseJiraDragKey(jiraKey);
		if (!issueKey) return;
		await createOrScheduleJiraTaskNote(host, issueKey, exactIso, anchorLeaf);
	}
}
