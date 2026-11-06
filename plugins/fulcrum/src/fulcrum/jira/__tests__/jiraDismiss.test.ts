import {describe, expect, it} from "vitest";
import {
	isJiraItemDismissed,
	partitionJiraItems,
	withJiraItemDismissed,
	withJiraItemRestored,
} from "../jiraDismiss";
import type {JiraActivityItem} from "../jiraTypes";

function ticket(overrides: Partial<JiraActivityItem> = {}): JiraActivityItem {
	return {
		key: "jira-ticket:TAXONOMY-1",
		kind: "ticket",
		issueKey: "TAXONOMY-1",
		issueTitle: "Do the thing",
		timestampIso: "2026-10-01T10:00:00Z",
		url: "https://deept.atlassian.net/browse/TAXONOMY-1",
		...overrides,
	};
}

describe("isJiraItemDismissed", () => {
	it("is false when the key has never been dismissed", () => {
		expect(isJiraItemDismissed(ticket(), {})).toBe(false);
	});

	it("is true when the dismissed snapshot matches the live timestamp", () => {
		const item = ticket();
		const dismissed = {[item.key]: item.timestampIso};
		expect(isJiraItemDismissed(item, dismissed)).toBe(true);
	});

	it("is false again once the item's timestamp moves past the dismissed snapshot", () => {
		const dismissed = {"jira-ticket:TAXONOMY-1": "2026-10-01T10:00:00Z"};
		const updated = ticket({timestampIso: "2026-10-05T09:00:00Z"});
		expect(isJiraItemDismissed(updated, dismissed)).toBe(false);
	});
});

describe("partitionJiraItems", () => {
	it("splits visible vs. dismissed-and-unchanged items", () => {
		const a = ticket({key: "jira-ticket:TAXONOMY-1", timestampIso: "2026-10-01T10:00:00Z"});
		const b = ticket({key: "jira-ticket:TAXONOMY-2", timestampIso: "2026-10-02T10:00:00Z"});
		const dismissed = {"jira-ticket:TAXONOMY-1": "2026-10-01T10:00:00Z"};
		const result = partitionJiraItems([a, b], dismissed);
		expect(result.visible).toEqual([b]);
		expect(result.dismissed).toEqual([a]);
	});

	it("resurfaces a dismissed item into visible once its timestamp changes", () => {
		const changed = ticket({timestampIso: "2026-10-09T10:00:00Z"});
		const dismissed = {"jira-ticket:TAXONOMY-1": "2026-10-01T10:00:00Z"};
		const result = partitionJiraItems([changed], dismissed);
		expect(result.visible).toEqual([changed]);
		expect(result.dismissed).toEqual([]);
	});
});

describe("withJiraItemDismissed / withJiraItemRestored", () => {
	it("adds and removes a key without mutating the input map", () => {
		const original = {} as Record<string, string>;
		const item = ticket();
		const dismissed = withJiraItemDismissed(original, item);
		expect(original).toEqual({});
		expect(dismissed).toEqual({[item.key]: item.timestampIso});

		const restored = withJiraItemRestored(dismissed, item.key);
		expect(dismissed).toEqual({[item.key]: item.timestampIso});
		expect(restored).toEqual({});
	});

	it("restoring an untracked key returns the same reference", () => {
		const dismissed: Record<string, string> = {"jira-ticket:TAXONOMY-9": "2026-01-01T00:00:00Z"};
		expect(withJiraItemRestored(dismissed, "jira-ticket:TAXONOMY-1")).toBe(dismissed);
	});
});
