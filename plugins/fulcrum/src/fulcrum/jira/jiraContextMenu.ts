import {Menu, type WorkspaceLeaf} from "obsidian";
import type {FulcrumHost} from "../pluginBridge";
import {createTaskNoteFromJiraTicket} from "./jiraTaskImport";
import {isJiraItemDismissed, withJiraItemDismissed, withJiraItemRestored} from "./jiraDismiss";

/** Identifies the row for dismiss/restore — omitted for callers that don't carry it (e.g. legacy). */
export interface JiraRowDismissInfo {
	key: string;
	timestampIso: string;
}

/**
 * Right-click menu for a Jira ticket/comment row in Today. Both row kinds resolve to the same
 * underlying ticket, so the same actions apply either way.
 */
export function showJiraRowContextMenu(
	ev: MouseEvent,
	host: FulcrumHost,
	issueKey: string,
	externalUrl: string | undefined,
	anchorLeaf?: WorkspaceLeaf,
	dismissInfo?: JiraRowDismissInfo,
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

	if (dismissInfo) {
		const dismissed = isJiraItemDismissed(dismissInfo, host.settings.jiraDismissedItems ?? {});
		menu.addItem((item) => {
			item.setTitle(dismissed ? "Restore to Jira list" : "Dismiss from Jira list");
			item.setIcon(dismissed ? "eye" : "eye-off");
			item.onClick(() => {
				const current = host.settings.jiraDismissedItems ?? {};
				const next = dismissed
					? withJiraItemRestored(current, dismissInfo.key)
					: withJiraItemDismissed(current, dismissInfo);
				void host.patchSettings({jiraDismissedItems: next});
			});
		});
	}

	menu.showAtMouseEvent(ev);
}
