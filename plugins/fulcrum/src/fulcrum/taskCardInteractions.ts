import {Menu, Notice, type WorkspaceLeaf} from "obsidian";
import {convertInlineTaskToNote} from "./convertInlineTaskToNote";
import {
	applyTaskDueChange,
	applyTaskProjectChange,
	applyTaskScheduledOnlyChange,
	applyTaskStatusChange,
	applyTaskTagsChange,
	applyTaskTitleChange,
} from "./kanban/taskFieldUpdate";
import {
	handleRecurringTaskComplete,
	taskIsRecurring,
} from "./recurrence/recurrenceComplete";
import {
	CreateTaskNoteModal,
	EditTaskTagsModal,
	EditTaskTitleModal,
	ProjectPickerModal,
	TaskFieldDateModal,
} from "./modals";
import type {FulcrumHost} from "./pluginBridge";
import {waitForNextFileResolved} from "./calendar/calendarTaskSchedule";
import {isDoneStatus, normalizeStatusKey, parseDoneStatusSet, parseList, parseTaskStatusChoices, type FulcrumSettings} from "./settingsDefaults";
import type {IndexedTask} from "./types";
import {displayTagsForTask} from "./utils/taskDisplayTags";

function formatStatusLabel(statusId: string): string {
	return statusId.trim();
}

async function afterTaskMutation(host: FulcrumHost): Promise<void> {
	await host.refreshIndex();
}

async function withFileResolved(
	host: FulcrumHost,
	task: IndexedTask,
	fn: () => Promise<void>,
): Promise<void> {
	const resolved = waitForNextFileResolved(host.app, task.file);
	await fn();
	await resolved;
	await afterTaskMutation(host);
}

function handleError(e: unknown): void {
	console.error(e);
	const msg = e instanceof Error ? e.message : String(e);
	new Notice(msg.length < 120 ? msg : "Could not update task.");
}

export function handleTaskStatusClick(
	ev: MouseEvent,
	host: FulcrumHost,
	task: IndexedTask,
): void {
	ev.preventDefault();
	ev.stopPropagation();
	const statuses = parseTaskStatusChoices(host.settings);
	if (statuses.length === 0) return;

	if (statuses.length === 2 && taskIsRecurring(task)) {
		if (!taskIsDone(task, host.settings)) {
			void withFileResolved(host, task, async () => {
				await handleRecurringTaskComplete(host.app, task, host.settings);
			}).catch(handleError);
		} else {
			const openStatus = statuses[0] ?? parseList(host.settings.taskStatuses)[0] ?? "todo";
			void withFileResolved(host, task, () =>
				applyTaskStatusChange(host.app, task, host.settings, openStatus),
			).catch(handleError);
		}
		return;
	}

	if (statuses.length === 2) {
		const current = (task.status ?? "").trim().toLowerCase();
		const next = statuses.find((s) => s.trim().toLowerCase() !== current) ?? statuses[0];
		void withFileResolved(host, task, () =>
			applyTaskStatusChange(host.app, task, host.settings, next),
		).catch(handleError);
		return;
	}

	const menu = new Menu();
	const current = (task.status ?? "").trim().toLowerCase();
	for (const st of statuses) {
		const isCurrent = st.trim().toLowerCase() === current;
		menu.addItem((item) => {
			item.setTitle(formatStatusLabel(st));
			item.setIcon("list");
			if (isCurrent) item.setDisabled(true);
			item.onClick(() => {
				if (isCurrent) return;
				void withFileResolved(host, task, () =>
					applyTaskStatusChange(host.app, task, host.settings, st),
				).catch(handleError);
			});
		});
	}
	menu.showAtMouseEvent(ev);
}

export function openEditTaskTitle(host: FulcrumHost, task: IndexedTask): void {
	new EditTaskTitleModal(host.app, task.title, async (title) => {
		await withFileResolved(host, task, () =>
			applyTaskTitleChange(host.app, task, host.settings, title),
		);
	}).open();
}

export function openEditTaskProject(host: FulcrumHost, task: IndexedTask): void {
	const projects = host.vaultIndex.getSnapshot().projects;
	new ProjectPickerModal(host.app, projects, (p) => {
		void withFileResolved(host, task, () =>
			applyTaskProjectChange(host.app, task, host.settings, p.file.path, projects),
		).catch(handleError);
	}).open();
}

export function openEditTaskNote(host: FulcrumHost, task: IndexedTask): void {
	if (task.source !== "taskNote") {
		host.openIndexedTask(task);
		return;
	}
	new CreateTaskNoteModal(host.app, host, {task}).open();
}

export function openTaskNoteFromCard(
	host: FulcrumHost,
	task: IndexedTask,
	anchorLeaf?: WorkspaceLeaf,
): void {
	host.openIndexedTask(task, anchorLeaf);
}

export function openTaskProjectFromCard(host: FulcrumHost, task: IndexedTask): void {
	if (!task.projectFile) return;
	void host.openProjectSummary(task.projectFile.path);
}

export function openEditTaskDue(host: FulcrumHost, task: IndexedTask): void {
	new TaskFieldDateModal(host.app, "Due date", task.dueDate, async (iso) => {
		await withFileResolved(host, task, () =>
			applyTaskDueChange(host.app, task, host.settings, iso),
		);
	}).open();
}

export function openEditTaskScheduled(host: FulcrumHost, task: IndexedTask): void {
	new TaskFieldDateModal(host.app, "Scheduled date", task.scheduledDate, async (iso) => {
		await withFileResolved(host, task, () =>
			applyTaskScheduledOnlyChange(host.app, task, host.settings, iso),
		);
	}).open();
}

export function openEditTaskTags(host: FulcrumHost, task: IndexedTask): void {
	const tags = displayTagsForTask(task, host.settings);
	const designated = host.settings.taskTag.trim().toLowerCase().replace(/^#/, "");
	const allTags = [...tags];
	if (
		!host.settings.taskSuppressDesignatedTagInDisplay &&
		designated &&
		!allTags.some((t) => t.toLowerCase() === designated)
	) {
		const raw =
			task.source === "inline" && task.inlineTags?.length ? task.inlineTags : task.tags;
		if (raw.some((t) => t.toLowerCase() === designated)) allTags.unshift(designated);
	}
	new EditTaskTagsModal(host.app, allTags, async (next) => {
		await withFileResolved(host, task, () =>
			applyTaskTagsChange(host.app, task, host.settings, next),
		);
	}).open();
}

export function taskIsDone(task: IndexedTask, settings: FulcrumSettings): boolean {
	const doneSet = parseDoneStatusSet(settings.taskDoneStatuses);
	const status = (task.status ?? "").trim();
	const yamlDone = settings.taskNoteYamlStatusDone.trim().toLowerCase();
	return isDoneStatus(status, doneSet) || (yamlDone.length > 0 && normalizeStatusKey(status) === yamlDone);
}

export function stopChipClick(ev: MouseEvent): void {
	ev.preventDefault();
	ev.stopPropagation();
}

/** Start a timer on a task note, converting inline tasks first. */
export async function startTaskTimerForCard(host: FulcrumHost, task: IndexedTask): Promise<void> {
	let notePath = task.file.path;
	let noteTitle = task.title;
	let projectFile = task.projectFile;

	if (task.source === "inline") {
		const created = await convertInlineTaskToNote(host, task);
		if (!created) return;
		notePath = created.path;
	}

	const projectName = projectFile?.basename.replace(/\.md$/i, "") ?? null;
	try {
		await host.startTimerInNote(notePath, {
			projectName,
			noteTitle,
		});
		host.bumpTimerRevision();
	} catch (e) {
		console.error(e);
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(msg.length < 120 ? msg : "Could not start timer.");
	}
}

export function handleTaskTimerToggleClick(
	ev: MouseEvent,
	host: FulcrumHost,
	task: IndexedTask,
): void {
	stopChipClick(ev);
	const active = host.timer
		.listActiveTimersInMemory()
		.some((row) => row.filePath === task.file.path);
	if (active) {
		void host.stopTimerInNote(task.file.path);
		return;
	}
	void startTaskTimerForCard(host, task);
}

export function taskCardTimerActive(host: FulcrumHost, task: IndexedTask): boolean {
	return host.timer.listActiveTimersInMemory().some((row) => row.filePath === task.file.path);
}

const TASK_CARD_INTERACTIVE =
	"button,a,[role=button],.fulcrum-task-card__status-dot,.fulcrum-task-card__title,.fulcrum-task-card__meta-chip,.fulcrum-task-card__start-timer,.fulcrum-task-card__timer,.fulcrum-task-inline-pill__status,.fulcrum-task-inline-pill__title,.fulcrum-task-inline-pill__meta,.fulcrum-task-inline-pill__open-note,.fulcrum-task-inline-pill__to-note";

/** Click on non-interactive card chrome opens the task edit modal (task notes) or note (inline). */
export function handleTaskCardBlankClick(
	ev: MouseEvent,
	host: FulcrumHost,
	task: IndexedTask,
	anchorLeaf?: WorkspaceLeaf,
): void {
	const target = ev.target;
	if (!(target instanceof HTMLElement)) return;
	if (target.closest(TASK_CARD_INTERACTIVE)) return;
	ev.preventDefault();
	ev.stopPropagation();
	if (task.source === "taskNote") {
		openEditTaskNote(host, task);
		return;
	}
	host.openIndexedTask(task, anchorLeaf);
}

export type TaskCardHostProps = {
	plugin: FulcrumHost;
	task: IndexedTask;
	done: boolean;
	anchorLeaf?: WorkspaceLeaf;
};
