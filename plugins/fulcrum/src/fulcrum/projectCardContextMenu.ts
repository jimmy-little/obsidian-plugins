import {Menu, Notice, type WorkspaceLeaf} from "obsidian";
import type {FulcrumHost} from "./pluginBridge";
import type {IndexedProject} from "./types";
import {
	applyProjectStatusChange,
	defaultApplyStatusOptions,
	getProjectStatusOptions,
} from "./projectStatusApply";

function projectJiraHref(host: FulcrumHost, p: IndexedProject): string | null {
	const raw = host.app.metadataCache.getFileCache(p.file)?.frontmatter?.[
		host.settings.projectJiraField
	];
	if (typeof raw !== "string" || !raw.trim()) return null;
	const t = raw.trim();
	return /^https?:\/\//i.test(t) ? t : null;
}

export type ProjectContextMenuOptions = {
	onReviewComplete?: () => void | Promise<void>;
};

/**
 * Project actions menu (Dashboard, sidebar, Horizon, Kanban, project banner). Does not open the project note by default.
 */
export function showFulcrumProjectCardContextMenu(
	ev: MouseEvent,
	host: FulcrumHost,
	p: IndexedProject,
	anchorLeaf?: WorkspaceLeaf,
	options?: ProjectContextMenuOptions,
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
	const ticketUrl = projectJiraHref(host, p);

	menu.addItem((item) => {
		item.setTitle("Open project");
		item.setIcon("layout-grid");
		item.onClick(() => {
			void host.openProjectSummary(projectPath);
		});
	});

	menu.addItem((item) => {
		item.setTitle("Open note");
		item.setIcon("square-arrow-out-up-right");
		item.onClick(() => {
			host.openLinkedNoteFromFulcrum(projectPath, anchorLeaf);
		});
	});

	if (ticketUrl) {
		const url = ticketUrl;
		menu.addItem((item) => {
			item.setTitle("External link");
			item.setIcon("external-link");
			item.onClick(() => {
				window.open(url, "_blank", "noopener,noreferrer");
			});
		});
	}

	menu.addItem((item) => {
		item.setTitle("Capture snapshot");
		item.setIcon("camera");
		item.onClick(() => {
			void host.archiveProjectSnapshot(projectPath);
		});
	});

	menu.addItem((item) => {
		item.setTitle("Edit properties");
		item.setIcon("file-json");
		item.onClick(() => {
			host.openProjectNoteProperties(projectPath);
		});
	});

	if (host.omnifocusCanSync()) {
		menu.addSeparator();
		if (host.omnifocusIsProjectConnected(projectPath)) {
			menu.addItem((item) => {
				item.setTitle("Clear OmniFocus project");
				item.setIcon("unlink");
				item.onClick(() => {
					void host.omnifocusClearProject(projectPath);
				});
			});
		} else {
			menu.addItem((item) => {
				item.setTitle("Link OmniFocus project…");
				item.setIcon("list-checks");
				item.onClick(() => {
					void host.omnifocusConnectProject(projectPath);
				});
			});
		}
	}

	if (host.conduitCanSync()) {
		if (host.conduitIsProjectConnected(projectPath)) {
			menu.addItem((item) => {
				item.setTitle("Clear Reminders list");
				item.setIcon("bell-off");
				item.onClick(() => {
					void host.conduitClearProjectReminderList(projectPath);
				});
			});
		} else {
			menu.addItem((item) => {
				item.setTitle("Set Reminders list…");
				item.setIcon("bell");
				item.onClick(() => {
					void host.conduitConnectProject(projectPath);
				});
			});
		}
	}

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Mark reviewed…");
		item.setIcon("glasses");
		item.onClick(() => {
			host.openMarkReviewedModal(projectPath, options?.onReviewComplete);
		});
	});

	menu.addItem((item) => {
		item.setTitle("Add milestone");
		item.setIcon("gem");
		item.onClick(() => {
			host.openAddMilestoneModal(projectPath);
		});
	});

	menu.addItem((item) => {
		item.setTitle("Mark project complete");
		item.setIcon("folder-check");
		item.onClick(() => {
			host.openMarkProjectCompleteModal(projectPath);
		});
	});

	if (showNewNote) {
		menu.addItem((item) => {
			item.setTitle("New note from template");
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
		item.setTitle("Start timer in project note");
		item.setIcon("play");
		item.onClick(() => {
			void host.startTimerInNote(projectPath, {
				projectName: p.name,
				noteTitle: p.name,
			});
		});
	});

	const statuses = getProjectStatusOptions(host.app, host.settings);
	const current = (p.status ?? "").trim().toLowerCase();

	if (statuses.length > 0) {
		menu.addSeparator();
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
