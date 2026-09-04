import {Menu, Notice} from "obsidian";
import type {WorkspaceLeaf} from "obsidian";
import type {FulcrumHost} from "../pluginBridge";
import {ProjectPickerModal} from "../modals";
import {DailyQuickNoteModal} from "./DailyQuickNoteModal";

/** Day + menu: task, task note, project note, or quick note on the daily note. */
export function showTodayAddMenu(
	plugin: FulcrumHost,
	dateIso: string,
	ev: MouseEvent,
	anchorLeaf?: WorkspaceLeaf,
): void {
	const slot = {dateIso, hour: null as number | null};
	const mode = plugin.settings.taskSourceMode;
	const projects = plugin.vaultIndex.getSnapshot().projects;

	const pickProject = (then: (path: string) => void): void => {
		if (projects.length === 0) {
			new Notice("No projects in the index yet.");
			return;
		}
		new ProjectPickerModal(plugin.app, projects, (p) => then(p.file.path)).open();
	};

	const menu = new Menu();
	if (mode === "obsidianTasks" || mode === "both") {
		menu.addItem((item) => {
			item.setTitle("Task");
			item.setIcon("check");
			item.onClick(() => {
				pickProject((path) => plugin.openNewInlineTaskForProjectOnDate(path, slot));
			});
		});
	}
	if (mode === "taskNotes" || mode === "both") {
		menu.addItem((item) => {
			item.setTitle("Task note");
			item.setIcon("file-check");
			item.onClick(() => {
				pickProject((path) => plugin.openCreateTaskNoteForProjectOnDate(path, slot));
			});
		});
	}
	menu.addItem((item) => {
		item.setTitle("Note");
		item.setIcon("file-plus");
		item.onClick(() => {
			pickProject((path) => {
				void plugin.createNewNoteFromTemplateForProject(path, anchorLeaf);
			});
		});
	});
	menu.addItem((item) => {
		item.setTitle("Quick note");
		item.setIcon("pen-line");
		item.onClick(() => {
			new DailyQuickNoteModal(plugin.app, plugin, dateIso).open();
		});
	});
	menu.showAtMouseEvent(ev);
}
