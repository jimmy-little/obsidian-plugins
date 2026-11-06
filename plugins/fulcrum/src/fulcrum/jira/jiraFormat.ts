/** Jira on Today is scoped to this Cloud site only. */
export const JIRA_SITE_BASE = "https://deept.atlassian.net";

/** TAXONOMY project, plus UCP issues in the Core Library component. */
export const JIRA_SCOPE_JQL = '(project = TAXONOMY OR (project = UCP AND component = "Core Library"))';

/** Mention comments older than this are not shown, even on an otherwise-matching issue. */
export const JIRA_MENTION_LOOKBACK_DAYS = 14;

/** Open tickets assigned to the token's account, newest updated first. */
export function jiraAssignedJql(): string {
	return `assignee = currentUser() AND ${JIRA_SCOPE_JQL} AND statusCategory != Done ORDER BY updated DESC`;
}

/**
 * Issues whose comments @mention the token's account, updated within the lookback window.
 * Not limited to {@link JIRA_SCOPE_JQL}: a mention on any project on this site (DTM, TAXONOMY, …)
 * should show up. `comment ~ currentUser()` matches the account id stored in the mention token.
 * Done issues are included. Comment creation time is filtered later — JQL `updated` is the issue.
 */
export function jiraMentionScanJql(days: number = JIRA_MENTION_LOOKBACK_DAYS): string {
	return `comment ~ currentUser() AND updated >= -${days}d ORDER BY updated DESC`;
}

export function jiraBrowseUrl(issueKey: string): string {
	return `${JIRA_SITE_BASE}/browse/${encodeURIComponent(issueKey)}`;
}

/** Deep link straight to a specific comment on the issue. */
export function jiraCommentUrl(issueKey: string, commentId: string): string {
	return `${jiraBrowseUrl(issueKey)}?focusedCommentId=${encodeURIComponent(commentId)}`;
}

/** Minimal Atlassian Document Format node shape — only what mention/text extraction needs. */
export interface AdfNode {
	type?: string;
	attrs?: {id?: string; text?: string};
	text?: string;
	content?: AdfNode[];
}

function asAdfNode(value: unknown): AdfNode | null {
	return value && typeof value === "object" ? (value as AdfNode) : null;
}

/** True when the ADF comment body contains a `mention` node targeting this Atlassian accountId. */
export function adfContainsMention(body: unknown, accountId: string): boolean {
	if (!accountId.trim()) return false;
	return walkAdfForMention(asAdfNode(body), accountId);
}

function walkAdfForMention(node: AdfNode | null, accountId: string): boolean {
	if (!node) return false;
	if (node.type === "mention" && node.attrs?.id === accountId) return true;
	if (!Array.isArray(node.content)) return false;
	return node.content.some((child) => walkAdfForMention(asAdfNode(child), accountId));
}

const ADF_BLOCK_TYPES = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock"]);

/** Flatten an ADF document to plain text; block nodes end with a newline. */
export function adfToPlainText(body: unknown): string {
	return walkAdfToText(asAdfNode(body)).trim();
}

function walkAdfToText(node: AdfNode | null): string {
	if (!node) return "";
	if (node.type === "text") return node.text ?? "";
	if (node.type === "hardBreak") return "\n";
	if (node.type === "mention") return node.attrs?.text ?? "";
	if (!Array.isArray(node.content)) return "";
	const joined = node.content.map((child) => walkAdfToText(asAdfNode(child))).join("");
	return ADF_BLOCK_TYPES.has(node.type ?? "") ? `${joined}\n` : joined;
}

/** Clamp a comment excerpt to a few non-empty lines for the Today row. */
export function clampExcerpt(text: string, maxLines = 3, maxChars = 220): string {
	const lines = text
		.replace(/\u00a0/g, " ")
		.split("\n")
		.map((l) => l.replace(/[ \t]+/g, " ").trim())
		.filter(Boolean);
	if (lines.length === 0) return "";
	const truncatedByLines = lines.length > maxLines;
	let out = lines.slice(0, maxLines).join("\n");
	if (out.length > maxChars) {
		return `${out.slice(0, maxChars - 1).trimEnd()}…`;
	}
	return truncatedByLines ? `${out}…` : out;
}

/**
 * True when a task note's external-link frontmatter value (a bare key or a full browse URL, same
 * convention as `projectJiraField`) refers to this Jira issue. Used for "Create task note"
 * duplicate detection, so re-running the action on the same ticket reopens the existing note.
 */
export function jiraFieldMatchesIssueKey(fieldValue: string | null | undefined, issueKey: string): boolean {
	const key = issueKey.trim().toLowerCase();
	if (!key) return false;
	const value = fieldValue?.trim().toLowerCase();
	if (!value) return false;
	if (value === key) return true;
	return value.endsWith(`/browse/${key}`);
}

/** Newest-first by timestamp — the order for the standing Today sidebar list. */
export function sortJiraActivityNewestFirst<T extends {timestampIso: string}>(items: T[]): T[] {
	return [...items].sort((a, b) => (Date.parse(b.timestampIso) || 0) - (Date.parse(a.timestampIso) || 0));
}

/**
 * Jira Cloud's REST API authenticates with HTTP Basic using the account email and an API token
 * (id.atlassian.com/manage-profile/security/api-tokens) — not `Authorization: Bearer`. Bearer PATs
 * are a Jira Server/Data Center feature (e.g. jira.disney.com); sending one to Cloud 403s.
 */
export function jiraBasicAuthHeader(email: string, apiToken: string): string {
	return `Basic ${btoa(`${email}:${apiToken}`)}`;
}

/**
 * Jira error responses are usually `{errorMessages: string[], errors: {field: reason}}`. Pull a
 * human-readable reason out of that shape so a 403/400 shows *why*, not just the status code.
 */
export function jiraErrorDetail(json: unknown): string | null {
	if (!json || typeof json !== "object") return null;
	const o = json as {errorMessages?: unknown; errors?: unknown};
	const parts: string[] = [];
	if (Array.isArray(o.errorMessages)) {
		for (const m of o.errorMessages) if (typeof m === "string" && m.trim()) parts.push(m.trim());
	}
	if (o.errors && typeof o.errors === "object") {
		for (const [field, reason] of Object.entries(o.errors as Record<string, unknown>)) {
			if (typeof reason === "string" && reason.trim()) parts.push(`${field}: ${reason.trim()}`);
		}
	}
	return parts.length > 0 ? parts.join("; ") : null;
}
