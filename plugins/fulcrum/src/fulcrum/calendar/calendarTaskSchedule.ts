import {App, Modal, TFile} from "obsidian";
import type {IndexedTask} from "../types";
import type {TaskScheduleDateField} from "../kanban/taskFieldUpdate";

export const FULCRUM_CALENDAR_TASK_MIME = "application/x-fulcrum-calendar-task+json";

export function calendarTaskDragKey(task: IndexedTask): string {
	return JSON.stringify({
		path: task.file.path,
		line: task.line ?? null,
		source: task.source,
	});
}

export function findTaskByDragKey(tasks: IndexedTask[], key: string): IndexedTask | undefined {
	try {
		const parsed = JSON.parse(key) as {
			path?: string;
			line?: number | null;
			source?: string;
		};
		if (!parsed.path || !parsed.source) return undefined;
		return tasks.find(
			(t) =>
				t.file.path === parsed.path &&
				(t.line ?? null) === (parsed.line ?? null) &&
				t.source === parsed.source,
		);
	} catch {
		return undefined;
	}
}

/** Modal: choose due vs scheduled when dropping a task on the calendar. */
export function promptTaskScheduleField(app: App): Promise<TaskScheduleDateField | null> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value: TaskScheduleDateField | null) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const modal = new Modal(app);
		modal.titleEl.setText("Set task date");
		const content = modal.contentEl;
		content.empty();
		content.createEl("p", {
			text: "Which date field should be updated?",
			cls: "fulcrum-calendar-schedule-prompt__text",
		});
		const row = content.createDiv({cls: "fulcrum-calendar-schedule-prompt__buttons"});
		const dueBtn = row.createEl("button", {text: "Due date", cls: "mod-cta"});
		const schedBtn = row.createEl("button", {text: "Scheduled date"});
		const cancelBtn = row.createEl("button", {text: "Cancel"});
		dueBtn.onclick = () => {
			finish("due");
			modal.close();
		};
		schedBtn.onclick = () => {
			finish("scheduled");
			modal.close();
		};
		cancelBtn.onclick = () => {
			finish(null);
			modal.close();
		};
		modal.onClose = () => finish(null);
		modal.open();
	});
}

/** Wait for metadata cache to catch up after a vault/frontmatter write. */
export function waitForMetadataCache(app: App, file: TFile, timeoutMs = 2500): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			app.metadataCache.offref(ref);
			resolve();
		};
		const ref = app.metadataCache.on("changed", (f) => {
			if (f.path === file.path) finish();
		});
		const timer = window.setTimeout(finish, timeoutMs);
	});
}
