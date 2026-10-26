import {Menu, type WorkspaceLeaf} from "obsidian";
import type {FulcrumHost} from "../pluginBridge";
import {createTaskNoteFromJiraTicket} from "./jiraTaskImport";

/**
 * Right-click menu for a Jira ticket/comment row in Today. Both row kinds resolve to the same
 * underlying ticket, so the same two actions apply either way.
 */
export function showJiraRowContextMenu(
	ev: MouseEvent,
	host: FulcrumHost,
	issueKey: string,
	externalUrl: string | undefined,
	anchorLeaf?: WorkspaceLeaf,
): void {
	ev.preventDefault();
	ev.stopPropagation();

	const menu = new Menu();

	menu.addItem((item) => {
		item.setTitle("Create task note");
		item.setIcon("file-plus");
		item.onClick(() => {
			void createTaskNoteFromJiraTicket(host, issueKey, anchorLeaf);
		});
	});

	if (externalUrl) {
		menu.addItem((item) => {
			item.setTitle("Open in Jira");
			item.setIcon("external-link");
			item.onClick(() => {
				window.open(externalUrl, "_blank", "noopener,noreferrer");
			});
		});
	}

	menu.showAtMouseEvent(ev);
}
