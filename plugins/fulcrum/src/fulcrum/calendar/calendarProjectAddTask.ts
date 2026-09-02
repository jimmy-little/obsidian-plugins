import {FuzzySuggestModal, Notice} from "obsidian";
import type {FulcrumHost} from "../pluginBridge";
import {applyTaskScheduleOnSlot} from "../kanban/taskFieldUpdate";
import type {IndexedTask} from "../types";
import {taskDisplayTitle} from "../utils/inlineTasks";
import type {CalendarDropSlot} from "./calendarDropSlot";
import {promptTaskScheduleField, waitForNextFileResolved} from "./calendarTaskSchedule";

export type ProjectCalendarPickItem = {kind: "new"} | {kind: "task"; task: IndexedTask};

export class ProjectCalendarTaskPickModal extends FuzzySuggestModal<ProjectCalendarPickItem> {
	constructor(
		app: import("obsidian").App,
		private readonly host: FulcrumHost,
		private readonly projectPath: string,
		private readonly slot: CalendarDropSlot,
		private readonly tasks: IndexedTask[],
		private readonly anchorEv?: MouseEvent,
	) {
		super(app);
	}

	getItems(): ProjectCalendarPickItem[] {
		const sorted = [...this.tasks].sort((a, b) =>
			taskDisplayTitle(a).localeCompare(taskDisplayTitle(b), undefined, {sensitivity: "base"}),
		);
		return [{kind: "new" as const}, ...sorted.map((task) => ({kind: "task" as const, task}))];
	}

	getItemText(item: ProjectCalendarPickItem): string {
		if (item.kind === "new") return "New task";
		return taskDisplayTitle(item.task);
	}

	onChooseItem(item: ProjectCalendarPickItem): void {
		if (item.kind === "new") {
			this.host.openNewTaskFromCalendarCell(this.projectPath, this.slot, this.anchorEv);
			return;
		}
		void this.scheduleExistingTask(item.task);
	}

	private async scheduleExistingTask(task: IndexedTask): Promise<void> {
		const field = await promptTaskScheduleField(this.app);
		if (!field) return;
		try {
			const resolved = waitForNextFileResolved(this.app, task.file);
			await applyTaskScheduleOnSlot(this.app, task, this.host.settings, this.slot, field);
			await resolved;
			await this.host.vaultIndex.rebuild();
			if (task.source === "inline") {
				await new Promise((r) => requestAnimationFrame(() => r(undefined)));
				await this.host.vaultIndex.rebuild();
			}
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg.length < 120 ? msg : "Could not schedule task.");
		}
	}
}

export function openProjectCalendarTaskPicker(
	host: FulcrumHost,
	projectPath: string,
	slot: CalendarDropSlot,
	tasks: IndexedTask[],
	anchorEv?: MouseEvent,
): void {
	new ProjectCalendarTaskPickModal(host.app, host, projectPath, slot, tasks, anchorEv).open();
}
