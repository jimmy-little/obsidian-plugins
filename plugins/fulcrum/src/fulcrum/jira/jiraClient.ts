import {requestUrl} from "obsidian";
import {
	JIRA_MENTION_LOOKBACK_DAYS,
	JIRA_SITE_BASE,
	adfContainsMention,
	adfToPlainText,
	clampExcerpt,
	jiraAssignedJql,
	jiraBasicAuthHeader,
	jiraBrowseUrl,
	jiraCommentUrl,
	jiraErrorDetail,
	jiraMentionScanJql,
} from "./jiraFormat";
import type {JiraActivityItem, JiraActivityResult, JiraConnectionResult} from "./jiraTypes";

/** Caps match the plan: enough to be useful without hammering the API on every Today refresh. */
const ASSIGNED_MAX_RESULTS = 50;
const MENTION_SCAN_MAX_RESULTS = 40;
const COMMENT_MAX_RESULTS = 50;

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Jira Cloud account email + API token (id.atlassian.com/manage-profile/security/api-tokens). */
export interface JiraCredentials {
	email: string;
	apiToken: string;
}

interface CacheEntry {
	cacheKey: string;
	at: number;
	items: JiraActivityItem[];
}

let cache: CacheEntry | null = null;

/** Forces the next `fetchJiraTodayActivity` call to hit the network (e.g. credentials just changed). */
export function clearJiraCache(): void {
	cache = null;
}

function trimCredentials(creds: JiraCredentials): JiraCredentials {
	return {email: creds.email.trim(), apiToken: creds.apiToken.trim()};
}

function hasCredentials(creds: JiraCredentials): boolean {
	return creds.email.length > 0 && creds.apiToken.length > 0;
}

function authHeaders(creds: JiraCredentials): Record<string, string> {
	return {
		Authorization: jiraBasicAuthHeader(creds.email, creds.apiToken),
		Accept: "application/json",
		"Content-Type": "application/json",
		// Jira/Confluence Cloud reject non-GET REST calls with a plain-text "XSRF check failed" (403)
		// unless this header is present. Harmless on GET requests, so it's sent on every call.
		"X-Atlassian-Token": "no-check",
	};
}

/** `res.json` throws synchronously if the body isn't valid JSON (e.g. a plain-text WAF rejection). */
function safeJson(res: {json: unknown}): unknown {
	try {
		return res.json;
	} catch {
		return undefined;
	}
}

/** Jira's structured error shape when present, else a short raw-text fallback (e.g. "XSRF check failed"). */
function jiraFailureDetail(res: {json: unknown; text: string}): string | null {
	const structured = jiraErrorDetail(safeJson(res));
	if (structured) return structured;
	const text = typeof res.text === "string" ? res.text.trim() : "";
	return text && text.length <= 300 ? text : null;
}

interface JiraMyselfJson {
	accountId?: string;
	displayName?: string;
}

async function requestMyself(
	creds: JiraCredentials,
): Promise<{status: number; json: JiraMyselfJson; detail: string | null}> {
	const res = await requestUrl({
		url: `${JIRA_SITE_BASE}/rest/api/3/myself`,
		method: "GET",
		headers: authHeaders(creds),
		throw: false,
	});
	const json = (safeJson(res) ?? {}) as JiraMyselfJson;
	return {status: res.status, json, detail: jiraFailureDetail(res)};
}

/** Read-only connectivity check for Settings → Integrations → Test connection. */
export async function testJiraConnection(email: string, apiToken: string): Promise<JiraConnectionResult> {
	const creds = trimCredentials({email, apiToken});
	if (!hasCredentials(creds)) {
		return {ok: false, message: "Add your Jira email and API token first."};
	}
	try {
		const {status, json, detail} = await requestMyself(creds);
		if (status >= 200 && status < 300) {
			return {
				ok: true,
				message: json.displayName ? `Connected to Jira as ${json.displayName}.` : "Connected to Jira.",
			};
		}
		if (status === 401 || status === 403) {
			return {
				ok: false,
				message:
					`Jira returned HTTP ${status}${detail ? ` — ${detail}` : ""}. Check that the email matches ` +
					`the account the API token belongs to (id.atlassian.com/manage-profile/security/api-tokens) ` +
					`— Jira Cloud rejects a bare token without it. If the email is right, this account may lack ` +
					`a Jira product license on this site, or "Browse projects" on TAXONOMY/UCP.`,
			};
		}
		return {ok: false, message: `Jira returned HTTP ${status}${detail ? ` — ${detail}` : "."}`};
	} catch (e) {
		return {ok: false, message: e instanceof Error ? e.message : "Could not reach Jira."};
	}
}

interface JiraIssueJson {
	key: string;
	fields?: {summary?: string; updated?: string};
}

export interface JiraIssueDetail {
	issueKey: string;
	title: string;
	descriptionText: string;
	url: string;
}

export interface JiraIssueDetailResult {
	issue: JiraIssueDetail | null;
	error?: string;
}

interface JiraSearchResponseJson {
	issues?: JiraIssueJson[];
}

interface JiraIssueLite {
	key: string;
	title: string;
	updated: string;
}

function toIssueLite(raw: JiraIssueJson): JiraIssueLite {
	return {
		key: raw.key,
		title: raw.fields?.summary?.trim() || raw.key,
		updated: raw.fields?.updated ?? "",
	};
}

async function searchJql(
	creds: JiraCredentials,
	jql: string,
	fields: string[],
	maxResults: number,
): Promise<JiraIssueLite[]> {
	// GET, not POST: Jira Cloud's XSRF filter only guards non-GET requests, and this site rejects a
	// POST to either /search or /search/jql with a plain-text "XSRF check failed" (403) regardless of
	// X-Atlassian-Token. A confirmed-working Jira integration against this same site uses GET with
	// query params on this exact endpoint, which never triggers the XSRF check at all.
	const query = new URLSearchParams({jql, maxResults: String(maxResults), fields: fields.join(",")});
	const res = await requestUrl({
		url: `${JIRA_SITE_BASE}/rest/api/3/search/jql?${query.toString()}`,
		method: "GET",
		headers: authHeaders(creds),
		throw: false,
	});
	if (res.status < 200 || res.status >= 300) {
		const detail = jiraFailureDetail(res);
		const hint =
			res.status === 403
				? " This account may lack a Jira product license on this site, or \"Browse projects\" on TAXONOMY/UCP."
				: "";
		throw new Error(`Jira search failed (HTTP ${res.status})${detail ? ` — ${detail}` : "."}${hint}`);
	}
	const json = (safeJson(res) ?? {}) as JiraSearchResponseJson;
	return (json.issues ?? []).map(toIssueLite);
}

interface JiraCommentJson {
	id: string;
	created: string;
	body?: unknown;
}

interface JiraCommentsResponseJson {
	comments?: JiraCommentJson[];
}

async function fetchRecentComments(creds: JiraCredentials, issueKey: string): Promise<JiraCommentJson[]> {
	const res = await requestUrl({
		url:
			`${JIRA_SITE_BASE}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment` +
			`?orderBy=-created&maxResults=${COMMENT_MAX_RESULTS}`,
		method: "GET",
		headers: authHeaders(creds),
		throw: false,
	});
	if (res.status < 200 || res.status >= 300) {
		const detail = jiraFailureDetail(res);
		console.warn(
			`Fulcrum: Jira comment fetch failed for ${issueKey} (HTTP ${res.status})${detail ? ` — ${detail}` : "."}`,
		);
		return [];
	}
	const json = (safeJson(res) ?? {}) as JiraCommentsResponseJson;
	return json.comments ?? [];
}

interface JiraIssueDetailJson {
	key: string;
	fields?: {summary?: string; description?: unknown};
}

/**
 * Single-issue fetch for the "Create task note" quick action: title + description only (no status,
 * type, priority, or labels — the import is intentionally minimal and one-way, never written back
 * to Jira).
 */
export async function fetchJiraIssueDetail(
	email: string,
	apiToken: string,
	issueKey: string,
): Promise<JiraIssueDetailResult> {
	const creds = trimCredentials({email, apiToken});
	const key = issueKey.trim();
	if (!hasCredentials(creds) || !key) {
		return {issue: null, error: "Add your Jira email and API token first."};
	}
	try {
		const res = await requestUrl({
			url: `${JIRA_SITE_BASE}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description`,
			method: "GET",
			headers: authHeaders(creds),
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) {
			const detail = jiraFailureDetail(res);
			return {
				issue: null,
				error: `Could not fetch ${key} from Jira (HTTP ${res.status})${detail ? ` — ${detail}` : "."}`,
			};
		}
		const json = (safeJson(res) ?? {}) as JiraIssueDetailJson;
		const resolvedKey = json.key || key;
		return {
			issue: {
				issueKey: resolvedKey,
				title: json.fields?.summary?.trim() || resolvedKey,
				descriptionText: adfToPlainText(json.fields?.description),
				url: jiraBrowseUrl(resolvedKey),
			},
		};
	} catch (e) {
		return {issue: null, error: e instanceof Error ? e.message : "Could not reach Jira."};
	}
}

/**
 * Read-only Jira activity for the Today view: open tickets assigned to the token's account
 * (TAXONOMY and UCP/Core Library), plus comments @mentioning it on any project in the last
 * {@link JIRA_MENTION_LOOKBACK_DAYS} days. Never writes to Jira.
 * Cached in memory for a few minutes so switching the focal day doesn't refetch.
 */
export async function fetchJiraTodayActivity(email: string, apiToken: string): Promise<JiraActivityResult> {
	const creds = trimCredentials({email, apiToken});
	if (!hasCredentials(creds)) return {items: []};

	const cacheKey = `${creds.email}:${creds.apiToken}`;
	const now = Date.now();
	if (cache && cache.cacheKey === cacheKey && now - cache.at < CACHE_TTL_MS) {
		return {items: cache.items};
	}

	try {
		const {status, json: myself, detail: myselfDetail} = await requestMyself(creds);
		if (status < 200 || status >= 300 || !myself.accountId) {
			return {
				items: [],
				error: `Could not verify the Jira account for this token (HTTP ${status})${
					myselfDetail ? ` — ${myselfDetail}` : "."
				}`,
			};
		}
		const accountId = myself.accountId;

		const assigned = await searchJql(
			creds,
			jiraAssignedJql(),
			["summary", "updated", "status", "assignee"],
			ASSIGNED_MAX_RESULTS,
		);
		const ticketItems: JiraActivityItem[] = assigned.map((issue) => ({
			key: `jira-ticket:${issue.key}`,
			kind: "ticket",
			issueKey: issue.key,
			issueTitle: issue.title,
			timestampIso: issue.updated,
			url: jiraBrowseUrl(issue.key),
		}));

		const scanIssues = await searchJql(
			creds,
			jiraMentionScanJql(),
			["summary", "updated"],
			MENTION_SCAN_MAX_RESULTS,
		);
		const cutoffMs = now - JIRA_MENTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
		const commentItems: JiraActivityItem[] = [];
		for (const issue of scanIssues) {
			const comments = await fetchRecentComments(creds, issue.key);
			for (const comment of comments) {
				const createdMs = Date.parse(comment.created ?? "");
				if (!Number.isFinite(createdMs)) continue;
				// Comments are newest-first; once we hit one older than the window, stop scanning this issue.
				if (createdMs < cutoffMs) break;
				if (!adfContainsMention(comment.body, accountId)) continue;
				commentItems.push({
					key: `jira-comment:${issue.key}:${comment.id}`,
					kind: "comment",
					issueKey: issue.key,
					issueTitle: issue.title,
					timestampIso: comment.created,
					url: jiraCommentUrl(issue.key, comment.id),
					commentExcerpt: clampExcerpt(adfToPlainText(comment.body), 1, 180),
				});
			}
		}

		const items = [...ticketItems, ...commentItems];
		cache = {cacheKey, at: now, items};
		return {items};
	} catch (e) {
		return {items: [], error: e instanceof Error ? e.message : "Could not load Jira activity."};
	}
}
