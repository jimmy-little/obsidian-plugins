import {Menu, Notice, type WorkspaceLeaf} from "obsidian";
import type {FulcrumHost} from "./pluginBridge";
import type {IndexedProject} from "./types";
import {
	applyProjectStatusChange,
	defaultApplyStatusOptions,
	getProjectStatusOptions,
} from "./projectStatusApply";

/**
 * Right-click menu for project cards (Dashboard, sidebar, Kanban, Areas). Does not open the project note.
 */
export function showFulcrumProjectCardContextMenu(
	ev: MouseEvent,
	host: FulcrumHost,
	p: IndexedProject,
	anchorLeaf?: WorkspaceLeaf,
): void {
	ev.preventDefault();
	ev.stopPropagation();

	const menu = new Menu();
	const projectPath = p.file.path;
	const settings = host.settings;

	const showNewNote = settings.projectNewNoteTemplatePath.trim().length > 0;
	const taskSourceMode = settings.taskSourceMode;
	const showNewTask = taskSourceMode === "obsidianTasks" || taskSourceMode === "both";
	const showNewTaskNote = taskSourceMode === "taskNotes" || taskSourceMode === "both";

	menu.addItem((item) => {
		item.setTitle("Mark reviewed…");
		item.setIcon("glasses");
		item.onClick(() => {
			host.openMarkReviewedModal(projectPath);
		});
	});

	if (showNewNote) {
		menu.addItem((item) => {
			item.setTitle("New note");
			item.setIcon("file-plus");
			item.onClick(() => {
				void host.createNewNoteFromTemplateForProject(projectPath, anchorLeaf);
			});
		});
	}

	if (showNewTask) {
		menu.addItem((item) => {
			item.setTitle("New task");
			item.setIcon("check");
			item.onClick(() => {
				host.openNewInlineTaskForProject(projectPath);
			});
		});
	}

	if (showNewTaskNote) {
		menu.addItem((item) => {
			item.setTitle("New task note");
			item.setIcon("file-check");
			item.onClick(() => {
				host.openTaskNoteCreateForProject(projectPath);
			});
		});
	}

	menu.addItem((item) => {
		item.setTitle("Start timer");
		item.setIcon("play");
		item.onClick(() => {
			void host.startTimerForProject(p.name, projectPath);
		});
	});

	const statuses = getProjectStatusOptions(host.app, host.settings);
	const current = (p.status ?? "").trim().toLowerCase();

	if (statuses.length > 0) {
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("Change status (advanced)…");
			item.setIcon("settings");
			item.onClick(() => {
				host.openChangeProjectStatusModal(projectPath, p.status ?? "");
			});
		});
		for (const st of statuses) {
			const label = st.replace(/\b\w/g, (c) => c.toUpperCase());
			const isCurrent = st.trim().toLowerCase() === current;
			menu.addItem((item) => {
				item.setTitle(`Status · ${label}`);
				item.setIcon("tag");
				if (isCurrent) item.setDisabled(true);
				item.onClick(() => {
					if (isCurrent) return;
					void applyProjectStatusChange(host.app, host, projectPath, st, defaultApplyStatusOptions(host)).catch(
						(e) => {
							console.error(e);
							const msg = e instanceof Error ? e.message : String(e);
							new Notice(msg.length < 120 ? msg : "Could not update project status.");
						},
					);
				});
			});
		}
	}

	menu.showAtMouseEvent(ev);
}
