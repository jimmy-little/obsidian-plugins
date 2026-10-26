export type JiraActivityKind = "ticket" | "comment";

/**
 * One row of Jira activity for the Today view: either a ticket assigned to the configured
 * account (TAXONOMY and UCP/Core Library), or a comment @mentioning it on any project.
 * Read-only — never written back to Jira.
 */
export interface JiraActivityItem {
	/** Unique key for list rendering / dedupe. */
	key: string;
	kind: JiraActivityKind;
	issueKey: string;
	issueTitle: string;
	/** ISO 8601 datetime (ticket: `fields.updated`; comment: `comment.created`). Drives sort + day bucketing. */
	timestampIso: string;
	/** Browse link (ticket) or `?focusedCommentId=` deep link (comment). */
	url: string;
	/** Plain-text excerpt, comments only. */
	commentExcerpt?: string;
}

export interface JiraConnectionResult {
	ok: boolean;
	message: string;
}

export interface JiraActivityResult {
	items: JiraActivityItem[];
	error?: string;
}
