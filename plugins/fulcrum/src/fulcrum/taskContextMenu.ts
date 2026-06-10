import {Menu, Notice, type WorkspaceLeaf} from "obsidian";
import {
	applyTaskDueChange,
	applyTaskPriorityChange,
	applyTaskProjectChange,
	applyTaskRecurrenceChange,
	applyTaskRecurrencePreset,
	applyTaskRemindersChange,
	applyTaskScheduledOnlyChange,
	applyTaskStatusChange,
} from "./kanban/taskFieldUpdate";
import {
	CreateTaskNoteModal,
	MergeTaskNoteTargetModal,
	MoveTaskNoteModal,
	promptDeleteIndexedTask,
	ProjectPickerModal,
	TaskFieldDateModal,
	TaskRecurrenceModal,
} from "./modals";
import {deleteIndexedTask} from "./deleteIndexedTask";
import {convertInlineTaskToNote} from "./convertInlineTaskToNote";
import type {FulcrumHost} from "./pluginBridge";
import {waitForNextFileResolved} from "./calendar/calendarTaskSchedule";
import {parseList, parseTaskStatusChoices} from "./settingsDefaults";
import type {IndexedTask} from "./types";
import {
	scheduleNextWeekIso,
	scheduleThisWeekendIso,
	scheduleTodayIso,
	scheduleTomorrowIso,
} from "./taskSchedulePresets";
import type {TaskReminderSpec} from "./types";
import {
	copyTextToClipboard,
	mergeTaskNoteInto,
	moveTaskNoteFile,
	obsidianLinkForTask,
	openTaskNote,
	showCopyObsidianLinkMenuItem,
	showCopyPathMenuItem,
	vaultRelativePath,
} from "./taskNoteActions";

/** Obsidian creates submenus via MenuItem#setSubmenu() (undocumented; no args). */
function createSubmenu(item: unknown): Menu {
	return (item as {setSubmenu: () => Menu}).setSubmenu();
}

function formatStatusLabel(statusId: string): string {
	return statusId.trim();
}

async function afterTaskMutation(host: FulcrumHost, task: IndexedTask): Promise<void> {
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
	await afterTaskMutation(host, task);
}

async function startTaskTimer(host: FulcrumHost, task: IndexedTask): Promise<void> {
	const projectName = task.projectFile?.basename.replace(/\.md$/i, "") ?? null;
	try {
		await host.startTimerInNote(task.file.path, {
			projectName,
			noteTitle: task.title,
		});
		host.bumpTimerRevision();
	} catch (e) {
		console.error(e);
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(msg.length < 120 ? msg : "Could not start timer.");
	}
}

function addDatePresetSubmenu(
	menu: Menu,
	label: string,
	icon: string,
	task: IndexedTask,
	host: FulcrumHost,
	apply: (iso: string | null) => Promise<void>,
): void {
	const presets: {title: string; iso: () => string}[] = [
		{title: "Today", iso: scheduleTodayIso},
		{title: "Tomorrow", iso: scheduleTomorrowIso},
		{title: "This weekend", iso: scheduleThisWeekendIso},
		{
			title: "Next week",
			iso: () => scheduleNextWeekIso(host.settings.calendarFirstDayOfWeek),
		},
	];
	menu.addItem((item) => {
		item.setTitle(label);
		item.setIcon(icon);
		const sub = createSubmenu(item);
		for (const p of presets) {
			sub.addItem((row) => {
				row.setTitle(p.title);
				row.onClick(() => {
					void withFileResolved(host, task, () => apply(p.iso())).catch(handleMenuError);
				});
			});
		}
		sub.addItem((row) => {
			row.setTitle("Set date / time…");
			row.onClick(() => {
				new TaskFieldDateModal(host.app, label, undefined, (iso) =>
					withFileResolved(host, task, () => apply(iso ?? "")),
				).open();
			});
		});
		sub.addItem((row) => {
			row.setTitle("Clear");
			row.onClick(() => {
				void withFileResolved(host, task, () => apply(null)).catch(handleMenuError);
			});
		});
	});
}

function handleMenuError(e: unknown): void {
	console.error(e);
	const msg = e instanceof Error ? e.message : String(e);
	new Notice(msg.length < 120 ? msg : "Could not update task.");
}

function addStatusSubmenu(menu: Menu, host: FulcrumHost, task: IndexedTask): void {
	const statuses = parseTaskStatusChoices(host.settings);
	if (statuses.length === 0) return;
	const current = (task.status ?? "").trim().toLowerCase();
	menu.addItem((item) => {
		item.setTitle("Status");
		item.setIcon("list");
		const sub = createSubmenu(item);
		for (const st of statuses) {
			const isCurrent = st.trim().toLowerCase() === current;
			sub.addItem((row) => {
				row.setTitle(formatStatusLabel(st));
				if (isCurrent) row.setDisabled(true);
				row.onClick(() => {
					if (isCurrent) return;
					void withFileResolved(host, task, () =>
						applyTaskStatusChange(host.app, task, host.settings, st),
					).catch(handleMenuError);
				});
			});
		}
	});
}

function addPrioritySubmenu(menu: Menu, host: FulcrumHost, task: IndexedTask): void {
	const priorities = parseList(host.settings.priorities);
	if (priorities.length === 0) return;
	menu.addItem((item) => {
		item.setTitle("Priority");
		item.setIcon("zap");
		const sub = createSubmenu(item);
		sub.addItem((row) => {
			row.setTitle("(none)");
			row.onClick(() => {
				void withFileResolved(host, task, () =>
					applyTaskPriorityChange(host.app, task, host.settings, null),
				).catch(handleMenuError);
			});
		});
		for (const p of priorities) {
			sub.addItem((row) => {
				row.setTitle(p);
				row.onClick(() => {
					void withFileResolved(host, task, () =>
						applyTaskPriorityChange(host.app, task, host.settings, p),
					).catch(handleMenuError);
				});
			});
		}
	});
}

function addRecurrenceSubmenu(menu: Menu, host: FulcrumHost, task: IndexedTask): void {
	if (task.source !== "taskNote") return;
	menu.addItem((item) => {
		item.setTitle("Recurrence");
		item.setIcon("repeat");
		const sub = createSubmenu(item);
		for (const [label, preset] of [
			["Daily", "daily"],
			["Weekly", "weekly"],
			["Monthly", "monthly"],
		] as const) {
			sub.addItem((row) => {
				row.setTitle(label);
				row.onClick(() => {
					void withFileResolved(host, task, () =>
						applyTaskRecurrencePreset(host.app, task, host.settings, preset),
					).catch(handleMenuError);
				});
			});
		}
		sub.addItem((row) => {
			row.setTitle("Custom…");
			row.onClick(() => {
				new TaskRecurrenceModal(host.app, task, (rule, anchor) =>
					withFileResolved(host, task, () =>
						applyTaskRecurrenceChange(host.app, task, host.settings, rule, anchor),
					),
				).open();
			});
		});
		sub.addItem((row) => {
			row.setTitle("Clear recurrence");
			row.onClick(() => {
				void withFileResolved(host, task, () =>
					applyTaskRecurrenceChange(host.app, task, host.settings, null),
				).catch(handleMenuError);
			});
		});
		sub.addSeparator();
		sub.addItem((row) => {
			row.setTitle("Repeat from · Scheduled");
			row.onClick(() => {
				if (!task.recurrence) return;
				void withFileResolved(host, task, () =>
					applyTaskRecurrenceChange(
						host.app,
						task,
						host.settings,
						task.recurrence!,
						"scheduled",
					),
				).catch(handleMenuError);
			});
		});
		sub.addItem((row) => {
			row.setTitle("Repeat from · Done");
			row.onClick(() => {
				if (!task.recurrence) return;
				void withFileResolved(host, task, () =>
					applyTaskRecurrenceChange(host.app, task, host.settings, task.recurrence!, "done"),
				).catch(handleMenuError);
			});
		});
	});
}

const REMINDER_PRESETS: {title: string; spec: TaskReminderSpec}[] = [
	{
		title: "At scheduled time",
		spec: {type: "relative", anchor: "scheduled", offset: 0, unit: "minutes", direction: "before"},
	},
	{
		title: "1 day before due",
		spec: {type: "relative", anchor: "due", offset: 1, unit: "days", direction: "before"},
	},
	{
		title: "1 hour before scheduled",
		spec: {type: "relative", anchor: "scheduled", offset: 1, unit: "hours", direction: "before"},
	},
];

function addReminderSubmenu(menu: Menu, host: FulcrumHost, task: IndexedTask): void {
	if (task.source !== "taskNote") return;
	menu.addItem((item) => {
		item.setTitle("Alert / Reminder");
		item.setIcon("bell");
		const sub = createSubmenu(item);
		for (const preset of REMINDER_PRESETS) {
			sub.addItem((row) => {
				row.setTitle(preset.title);
				row.onClick(() => {
					const existing = [...(task.reminders ?? []), preset.spec];
					void withFileResolved(host, task, () =>
						applyTaskRemindersChange(host.app, task, host.settings, existing),
					).catch(handleMenuError);
				});
			});
		}
		sub.addItem((row) => {
			row.setTitle("Clear all reminders");
			row.onClick(() => {
				void withFileResolved(host, task, () =>
					applyTaskRemindersChange(host.app, task, host.settings, null),
				).catch(handleMenuError);
			});
		});
	});
}

function addProjectSubmenu(menu: Menu, host: FulcrumHost, task: IndexedTask): void {
	const projects = host.vaultIndex.getSnapshot().projects;
	if (projects.length >= 20) {
		menu.addItem((item) => {
			item.setTitle("Project");
			item.setIcon("folder");
			item.onClick(() => {
				new ProjectPickerModal(host.app, projects, (p) => {
					void withFileResolved(host, task, () =>
						applyTaskProjectChange(host.app, task, host.settings, p.file.path, projects),
					).catch(handleMenuError);
				}).open();
			});
		});
		return;
	}
	menu.addItem((item) => {
		item.setTitle("Project");
		item.setIcon("folder");
		const sub = createSubmenu(item);
		sub.addItem((row) => {
			row.setTitle("(none)");
			row.onClick(() => {
				void withFileResolved(host, task, () =>
					applyTaskProjectChange(host.app, task, host.settings, "__none__", projects),
				).catch(handleMenuError);
			});
		});
		for (const p of projects) {
			sub.addItem((row) => {
				row.setTitle(p.name);
				row.onClick(() => {
					void withFileResolved(host, task, () =>
						applyTaskProjectChange(host.app, task, host.settings, p.file.path, projects),
					).catch(handleMenuError);
				});
			});
		}
	});
}

function addNoteActionsSubmenu(
	menu: Menu,
	host: FulcrumHost,
	task: IndexedTask,
	anchorLeaf?: WorkspaceLeaf,
): void {
	menu.addItem((item) => {
		item.setTitle("Note actions");
		item.setIcon("more-horizontal");
		const sub = createSubmenu(item);
		sub.addItem((row) => {
			row.setTitle("Open");
			row.setIcon("document");
			row.onClick(() => host.openIndexedTask(task, anchorLeaf));
		});
		sub.addItem((row) => {
			row.setTitle("Open in new tab");
			row.setIcon("lucide-external-link");
			row.onClick(() => openTaskNote(host.app, task, undefined, undefined, true));
		});
		if (task.source === "inline") {
			sub.addItem((row) => {
				row.setTitle("Open source note");
				row.setIcon("square-arrow-out-up-right");
				row.onClick(() => host.openLinkedNoteFromFulcrum(task.file.path, anchorLeaf));
			});
			sub.addItem((row) => {
				row.setTitle("Convert to task note");
				row.setIcon("file-plus");
				row.onClick(() => {
					void convertInlineTaskToNote(host, task).catch(handleMenuError);
				});
			});
		}
		showCopyPathMenuItem(sub, task);
		showCopyObsidianLinkMenuItem(sub, host.app, host.settings, task);
		if (task.source === "taskNote") {
			sub.addItem((row) => {
				row.setTitle("Move note…");
				row.setIcon("folder-input");
				row.onClick(() => {
					new MoveTaskNoteModal(host.app, (folder) => {
						void (async () => {
							const ok = await moveTaskNoteFile(host.app, task, folder);
							if (ok) await host.refreshIndex();
						})().catch(handleMenuError);
					}).open();
				});
			});
			sub.addItem((row) => {
				row.setTitle("Merge into…");
				row.setIcon("merge");
				row.onClick(() => {
					new MergeTaskNoteTargetModal(host.app, task.file.path, (targetPath) => {
						void (async () => {
							const ok = await mergeTaskNoteInto(host.app, task, targetPath);
							if (ok) await host.refreshIndex();
						})().catch(handleMenuError);
					}).open();
				});
			});
		}
		sub.addSeparator();
		sub.addItem((row) => {
			row.setTitle("Delete");
			row.setIcon("trash");
			row.onClick(() => {
				void (async () => {
					const ok = await promptDeleteIndexedTask(host.app, task);
					if (!ok) return;
					await deleteIndexedTask(host.app, task, host);
					await host.refreshIndex();
					new Notice("Task deleted.");
				})().catch(handleMenuError);
			});
		});
	});
}

/**
 * Universal right-click menu for indexed tasks (cards, calendar blocks, activity rows).
 */
export function showFulcrumTaskContextMenu(
	ev: MouseEvent,
	host: FulcrumHost,
	task: IndexedTask,
	anchorLeaf?: WorkspaceLeaf,
): void {
	ev.preventDefault();
	ev.stopPropagation();

	const menu = new Menu();

	menu.addItem((item) => {
		item.setTitle("Start timer");
		item.setIcon("play");
		item.onClick(() => void startTaskTimer(host, task));
	});

	addStatusSubmenu(menu, host, task);
	addPrioritySubmenu(menu, host, task);

	addDatePresetSubmenu(menu, "Due date", "calendar-days", task, host, (iso) =>
		iso === null
			? applyTaskDueChange(host.app, task, host.settings, null)
			: applyTaskDueChange(host.app, task, host.settings, iso),
	);

	addDatePresetSubmenu(menu, "Scheduled", "calendar", task, host, (iso) =>
		iso === null
			? applyTaskScheduledOnlyChange(host.app, task, host.settings, null)
			: applyTaskScheduledOnlyChange(host.app, task, host.settings, iso),
	);

	addReminderSubmenu(menu, host, task);
	addRecurrenceSubmenu(menu, host, task);
	addProjectSubmenu(menu, host, task);

	menu.addSeparator();

	if (task.source === "taskNote") {
		menu.addItem((item) => {
			item.setTitle("Create subtask");
			item.setIcon("list-plus");
			item.onClick(() => {
				new CreateTaskNoteModal(host.app, host, {parentTask: task}).open();
			});
		});
	}

	addNoteActionsSubmenu(menu, host, task, anchorLeaf);

	menu.showAtMouseEvent(ev);
}

/** Copy helpers exported for commands. */
export {copyTextToClipboard, obsidianLinkForTask, vaultRelativePath};
