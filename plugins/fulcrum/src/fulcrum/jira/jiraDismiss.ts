import type {JiraActivityItem} from "./jiraTypes";

/** Minimal shape needed to check/toggle dismissal — a full `JiraActivityItem` satisfies this. */
export interface JiraDismissRef {
	key: string;
	timestampIso: string;
}

/**
 * True when `item` is currently hidden: its key has a dismissed snapshot timestamp that still
 * matches the live item's timestamp. If the ticket/comment changes (new `updated`/`created`), the
 * snapshot goes stale and the item is treated as visible again — "dismiss" means "nothing's changed
 * since I looked at this," not "hide forever."
 */
export function isJiraItemDismissed(item: JiraDismissRef, dismissed: Record<string, string>): boolean {
	const snapshot = dismissed[item.key];
	return snapshot != null && snapshot === item.timestampIso;
}

/** Splits a fetched Jira activity list into what's currently visible vs. dismissed-and-unchanged. */
export function partitionJiraItems(
	items: JiraActivityItem[],
	dismissed: Record<string, string>,
): {visible: JiraActivityItem[]; dismissed: JiraActivityItem[]} {
	const visible: JiraActivityItem[] = [];
	const dismissedOut: JiraActivityItem[] = [];
	for (const item of items) {
		(isJiraItemDismissed(item, dismissed) ? dismissedOut : visible).push(item);
	}
	return {visible, dismissed: dismissedOut};
}

/** Returns a new dismissed map with `item` hidden (snapshotting its current timestamp). */
export function withJiraItemDismissed(
	dismissed: Record<string, string>,
	item: JiraDismissRef,
): Record<string, string> {
	return {...dismissed, [item.key]: item.timestampIso};
}

/** Returns a new dismissed map with `key` restored. No-op (same reference) if it wasn't dismissed. */
export function withJiraItemRestored(dismissed: Record<string, string>, key: string): Record<string, string> {
	if (!(key in dismissed)) return dismissed;
	const next = {...dismissed};
	delete next[key];
	return next;
}
