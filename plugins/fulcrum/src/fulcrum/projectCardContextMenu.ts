import {Menu, Notice} from "obsidian";
import type {FulcrumHost} from "./pluginBridge";
import type {IndexedProject} from "./types";
import {
	applyProjectStatusChange,
	defaultApplyStatusOptions,
	getProjectStatusOptions,
} from "./projectStatusApply";

/**
 * Right-click menu for project cards (Dashboard, Kanban, Areas). Does not open the project note.
 */
export function showFulcrumProjectCardContextMenu(
	ev: MouseEvent,
	host: FulcrumHost,
	p: IndexedProject,
): void {
	ev.preventDefault();
	ev.stopPropagation();

	const menu = new Menu();

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
					void applyProjectStatusChange(host.app, host, p.file.path, st, defaultApplyStatusOptions(host)).catch(
						(e) => {
							console.error(e);
							const msg = e instanceof Error ? e.message : String(e);
							new Notice(msg.length < 120 ? msg : "Could not update project status.");
						},
					);
				});
			});
		}
		menu.addSeparator();
	}

	menu.addItem((item) => {
		item.setTitle("Mark reviewed…");
		item.setIcon("glasses");
		item.onClick(() => {
			host.openMarkReviewedModal(p.file.path);
		});
	});

	menu.addItem((item) => {
		item.setTitle("Quick note…");
		item.setIcon("pencil-line");
		item.onClick(() => {
			host.openQuickProjectNoteModal(p.file.path);
		});
	});

	menu.showAtMouseEvent(ev);
}
