import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	requestUrl: vi.fn(),
}));

import {requestUrl} from "obsidian";
import type {RequestUrlParam} from "obsidian";
import {clearJiraCache, fetchJiraIssueDetail, fetchJiraTodayActivity, testJiraConnection} from "../jiraClient";

const mockedRequestUrl = vi.mocked(requestUrl);

const ACCOUNT_ID = "acc-1";
const EMAIL = "jimmy.little@disney.com";
const TOKEN = "secret-token";

function mentionBody(text: string) {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{type: "mention", attrs: {id: ACCOUNT_ID, text: "@Jimmy"}},
					{type: "text", text: ` ${text}`},
				],
			},
		],
	};
}

function jsonResponse(status: number, json: unknown) {
	return {status, json, text: JSON.stringify(json)} as never;
}

/**
 * Simulates Obsidian's real `requestUrl` response: `.json` is a lazy getter that runs
 * `JSON.parse(text)` and throws if the body isn't valid JSON — e.g. a plain-text
 * "XSRF check failed" rejection from Jira Cloud's WAF.
 */
function textResponse(status: number, text: string) {
	const res: {status: number; text: string; json?: unknown} = {status, text};
	Object.defineProperty(res, "json", {get: () => JSON.parse(text)});
	return res as never;
}

beforeEach(() => {
	mockedRequestUrl.mockReset();
	clearJiraCache();
});

describe("testJiraConnection", () => {
	it("refuses to call Jira with no email or token", async () => {
		const result = await testJiraConnection("  ", "  ");
		expect(result.ok).toBe(false);
		expect(mockedRequestUrl).not.toHaveBeenCalled();
	});

	it("refuses to call Jira with a token but no email", async () => {
		const result = await testJiraConnection("", TOKEN);
		expect(result.ok).toBe(false);
		expect(mockedRequestUrl).not.toHaveBeenCalled();
	});

	it("sends Basic auth (email:token), not a bare bearer token — Jira Cloud rejects Bearer", async () => {
		mockedRequestUrl.mockResolvedValue(jsonResponse(200, {accountId: ACCOUNT_ID, displayName: "Jimmy Little"}));
		await testJiraConnection(EMAIL, TOKEN);
		const call = mockedRequestUrl.mock.calls[0]?.[0] as RequestUrlParam;
		const headers = call.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Basic ${btoa(`${EMAIL}:${TOKEN}`)}`);
		expect(headers.Authorization).not.toContain("Bearer");
		// Without this, Jira Cloud 403s non-GET calls with a plain-text "XSRF check failed" body.
		expect(headers["X-Atlassian-Token"]).toBe("no-check");
	});

	it("surfaces the raw body instead of a JSON-parse crash when Jira rejects with plain text (XSRF)", async () => {
		mockedRequestUrl.mockResolvedValue(textResponse(403, "XSRF check failed"));
		const result = await testJiraConnection(EMAIL, TOKEN);
		expect(result.ok).toBe(false);
		expect(result.message).toContain("XSRF check failed");
		expect(result.message).not.toContain("Unexpected token");
	});

	it("reports the display name on success", async () => {
		mockedRequestUrl.mockResolvedValue(jsonResponse(200, {accountId: ACCOUNT_ID, displayName: "Jimmy Little"}));
		const result = await testJiraConnection(EMAIL, TOKEN);
		expect(result.ok).toBe(true);
		expect(result.message).toContain("Jimmy Little");
	});

	it("surfaces a 403 with a hint about the email/token pairing (the Bearer-vs-Basic mistake)", async () => {
		mockedRequestUrl.mockResolvedValue(jsonResponse(403, {}));
		const result = await testJiraConnection(EMAIL, "bad-token");
		expect(result.ok).toBe(false);
		expect(result.message).toContain("403");
		expect(result.message.toLowerCase()).toContain("email");
	});

	it("surfaces a non-2xx status", async () => {
		mockedRequestUrl.mockResolvedValue(jsonResponse(500, {}));
		const result = await testJiraConnection(EMAIL, "bad-token");
		expect(result.ok).toBe(false);
		expect(result.message).toContain("500");
	});

	it("surfaces a network failure", async () => {
		mockedRequestUrl.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
		const result = await testJiraConnection(EMAIL, TOKEN);
		expect(result.ok).toBe(false);
		expect(result.message).toContain("ENOTFOUND");
	});
});

describe("fetchJiraTodayActivity", () => {
	it("returns no items and makes no network call without both email and token", async () => {
		expect((await fetchJiraTodayActivity("", "")).items).toEqual([]);
		expect((await fetchJiraTodayActivity(EMAIL, "")).items).toEqual([]);
		expect((await fetchJiraTodayActivity("", TOKEN)).items).toEqual([]);
		expect(mockedRequestUrl).not.toHaveBeenCalled();
	});

	it("surfaces Jira's actual reason when /myself works but search is forbidden (license/permission gap)", async () => {
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			if (params.url.endsWith("/rest/api/3/myself")) return jsonResponse(200, {accountId: ACCOUNT_ID});
			if (params.url.includes("/rest/api/3/search/jql?")) {
				return jsonResponse(403, {errorMessages: ["You do not have the Jira software access required."]});
			}
			throw new Error(`unexpected request: ${params.url}`);
		});

		const result = await fetchJiraTodayActivity(EMAIL, TOKEN);
		expect(result.items).toEqual([]);
		expect(result.error).toContain("403");
		expect(result.error).toContain("You do not have the Jira software access required.");
		expect(result.error).toContain("product license");
	});

	it("surfaces a plain-text XSRF rejection from the search call without crashing on JSON.parse", async () => {
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			if (params.url.endsWith("/rest/api/3/myself")) return jsonResponse(200, {accountId: ACCOUNT_ID});
			if (params.url.includes("/rest/api/3/search/jql?")) return textResponse(403, "XSRF check failed");
			throw new Error(`unexpected request: ${params.url}`);
		});

		const result = await fetchJiraTodayActivity(EMAIL, TOKEN);
		expect(result.items).toEqual([]);
		expect(result.error).toContain("XSRF check failed");
		expect(result.error).not.toContain("Unexpected token");
	});

	it("searches with GET + query params, not POST — Jira Cloud's XSRF filter only guards non-GET calls", async () => {
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			if (params.url.endsWith("/rest/api/3/myself")) return jsonResponse(200, {accountId: ACCOUNT_ID});
			if (params.url.includes("/rest/api/3/search/jql?")) {
				expect(params.method).toBe("GET");
				expect(params.body).toBeUndefined();
				expect((params.headers as Record<string, string>)["X-Atlassian-Token"]).toBe("no-check");
				return jsonResponse(200, {issues: []});
			}
			throw new Error(`unexpected request: ${params.url}`);
		});

		await fetchJiraTodayActivity(EMAIL, TOKEN);
	});

	it("reports an error when the credentials cannot be verified", async () => {
		mockedRequestUrl.mockResolvedValue(jsonResponse(401, {}));
		const result = await fetchJiraTodayActivity(EMAIL, "bad-token");
		expect(result.items).toEqual([]);
		expect(result.error).toBeTruthy();
	});

	it("combines assigned tickets with mention comments, scoped and within the lookback window", async () => {
		const now = Date.now();
		const recentIso = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
		const oldIso = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();

		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			const {url} = params;
			// Every call must authenticate with Basic email:token — never a bare Bearer token.
			const auth = (params.headers as Record<string, string> | undefined)?.Authorization;
			expect(auth).toBe(`Basic ${btoa(`${EMAIL}:${TOKEN}`)}`);
			if (url.endsWith("/rest/api/3/myself")) {
				return jsonResponse(200, {accountId: ACCOUNT_ID, displayName: "Jimmy Little"});
			}
			if (url.includes("/rest/api/3/search/jql?")) {
				const jql = new URL(url).searchParams.get("jql") ?? "";
				if (jql.includes("assignee = currentUser()")) {
					expect(jql).toContain("TAXONOMY");
					expect(jql).toContain("Core Library");
					return jsonResponse(200, {
						issues: [
							{
								key: "TAXONOMY-1",
								fields: {summary: "Ticket one", updated: "2026-10-20T10:00:00.000-0700"},
							},
						],
					});
				}
				expect(jql).toContain("comment ~ currentUser()");
				expect(jql).not.toContain("project = TAXONOMY");
				return jsonResponse(200, {
					issues: [{key: "TAXONOMY-2", fields: {summary: "Ticket two", updated: oldIso}}],
				});
			}
			if (url.includes("/issue/TAXONOMY-2/comment")) {
				return jsonResponse(200, {
					comments: [
						{id: "c1", created: recentIso, body: mentionBody("check this")},
						{id: "c2", created: oldIso, body: mentionBody("ancient")},
						{id: "c3", created: recentIso, body: mentionBody("never reached")},
					],
				});
			}
			throw new Error(`unexpected request: ${url}`);
		});

		const result = await fetchJiraTodayActivity(EMAIL, TOKEN);
		expect(result.error).toBeUndefined();

		const ticket = result.items.find((i) => i.kind === "ticket");
		expect(ticket).toMatchObject({
			key: "jira-ticket:TAXONOMY-1",
			issueKey: "TAXONOMY-1",
			issueTitle: "Ticket one",
			timestampIso: "2026-10-20T10:00:00.000-0700",
			url: "https://deept.atlassian.net/browse/TAXONOMY-1",
		});

		const comments = result.items.filter((i) => i.kind === "comment");
		// Comments are newest-first; once the 20-day-old comment is hit, scanning that issue stops —
		// c3 (after it in the array) must never be reached even though it would otherwise match.
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			key: "jira-comment:TAXONOMY-2:c1",
			issueKey: "TAXONOMY-2",
			issueTitle: "Ticket two",
			timestampIso: recentIso,
			url: "https://deept.atlassian.net/browse/TAXONOMY-2?focusedCommentId=c1",
			commentExcerpt: "@Jimmy check this",
		});
	});

	it("ignores comments that don't mention the account", async () => {
		const now = Date.now();
		const recentIso = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			const {url} = params;
			if (url.endsWith("/rest/api/3/myself")) return jsonResponse(200, {accountId: ACCOUNT_ID});
			if (url.includes("/rest/api/3/search/jql?")) {
				const jql = new URL(url).searchParams.get("jql") ?? "";
				if (jql.includes("assignee = currentUser()")) return jsonResponse(200, {issues: []});
				return jsonResponse(200, {issues: [{key: "TAXONOMY-3", fields: {summary: "No mention", updated: recentIso}}]});
			}
			if (url.includes("/issue/TAXONOMY-3/comment")) {
				return jsonResponse(200, {
					comments: [
						{
							id: "c1",
							created: recentIso,
							body: {type: "doc", content: [{type: "paragraph", content: [{type: "text", text: "no mentions"}]}]},
						},
					],
				});
			}
			throw new Error(`unexpected request: ${url}`);
		});

		const result = await fetchJiraTodayActivity(EMAIL, TOKEN);
		expect(result.items).toEqual([]);
	});

	it("caches results for the same credentials and does not refetch", async () => {
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			if (params.url.endsWith("/rest/api/3/myself")) return jsonResponse(200, {accountId: ACCOUNT_ID});
			if (params.url.includes("/rest/api/3/search/jql?")) return jsonResponse(200, {issues: []});
			throw new Error(`unexpected request: ${params.url}`);
		});

		await fetchJiraTodayActivity(EMAIL, TOKEN);
		const callsAfterFirst = mockedRequestUrl.mock.calls.length;
		expect(callsAfterFirst).toBeGreaterThan(0);

		await fetchJiraTodayActivity(EMAIL, TOKEN);
		expect(mockedRequestUrl.mock.calls.length).toBe(callsAfterFirst);
	});

	it("refetches after the token changes, even if the cache hasn't expired", async () => {
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			if (params.url.endsWith("/rest/api/3/myself")) return jsonResponse(200, {accountId: ACCOUNT_ID});
			if (params.url.includes("/rest/api/3/search/jql?")) return jsonResponse(200, {issues: []});
			throw new Error(`unexpected request: ${params.url}`);
		});

		await fetchJiraTodayActivity(EMAIL, TOKEN);
		const callsAfterFirst = mockedRequestUrl.mock.calls.length;

		await fetchJiraTodayActivity(EMAIL, "a-different-token");
		expect(mockedRequestUrl.mock.calls.length).toBe(callsAfterFirst * 2);
	});

	it("refetches after clearJiraCache", async () => {
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			if (params.url.endsWith("/rest/api/3/myself")) return jsonResponse(200, {accountId: ACCOUNT_ID});
			if (params.url.includes("/rest/api/3/search/jql?")) return jsonResponse(200, {issues: []});
			throw new Error(`unexpected request: ${params.url}`);
		});

		await fetchJiraTodayActivity(EMAIL, TOKEN);
		const callsAfterFirst = mockedRequestUrl.mock.calls.length;

		clearJiraCache();
		await fetchJiraTodayActivity(EMAIL, TOKEN);
		expect(mockedRequestUrl.mock.calls.length).toBe(callsAfterFirst * 2);
	});
});

describe("fetchJiraIssueDetail", () => {
	it("refuses to call Jira with no email or token", async () => {
		const result = await fetchJiraIssueDetail("", "", "TAXONOMY-1234");
		expect(result.issue).toBeNull();
		expect(mockedRequestUrl).not.toHaveBeenCalled();
	});

	it("fetches summary + description (flattened from ADF) and builds the browse URL", async () => {
		mockedRequestUrl.mockImplementation((request) => {
			const params = request as RequestUrlParam;
			expect(params.url).toBe(
				`https://deept.atlassian.net/rest/api/3/issue/TAXONOMY-1234?fields=summary,description`,
			);
			expect(params.method).toBe("GET");
			const headers = params.headers as Record<string, string>;
			expect(headers.Authorization).toBe(`Basic ${btoa(`${EMAIL}:${TOKEN}`)}`);
			return jsonResponse(200, {
				key: "TAXONOMY-1234",
				fields: {
					summary: "Fix the thing",
					description: {
						type: "doc",
						content: [{type: "paragraph", content: [{type: "text", text: "Steps to reproduce."}]}],
					},
				},
			});
		});

		const result = await fetchJiraIssueDetail(EMAIL, TOKEN, "TAXONOMY-1234");
		expect(result.error).toBeUndefined();
		expect(result.issue).toEqual({
			issueKey: "TAXONOMY-1234",
			title: "Fix the thing",
			descriptionText: "Steps to reproduce.",
			url: "https://deept.atlassian.net/browse/TAXONOMY-1234",
		});
	});

	it("falls back to the issue key as the title when summary is missing", async () => {
		mockedRequestUrl.mockResolvedValue(jsonResponse(200, {key: "TAXONOMY-1234", fields: {}}));
		const result = await fetchJiraIssueDetail(EMAIL, TOKEN, "TAXONOMY-1234");
		expect(result.issue?.title).toBe("TAXONOMY-1234");
		expect(result.issue?.descriptionText).toBe("");
	});

	it("surfaces a non-2xx status with Jira's error detail", async () => {
		mockedRequestUrl.mockResolvedValue(jsonResponse(404, {errorMessages: ["Issue does not exist."]}));
		const result = await fetchJiraIssueDetail(EMAIL, TOKEN, "TAXONOMY-9999");
		expect(result.issue).toBeNull();
		expect(result.error).toContain("404");
		expect(result.error).toContain("Issue does not exist.");
	});

	it("surfaces a plain-text rejection without crashing on JSON.parse", async () => {
		mockedRequestUrl.mockResolvedValue(textResponse(403, "XSRF check failed"));
		const result = await fetchJiraIssueDetail(EMAIL, TOKEN, "TAXONOMY-1234");
		expect(result.issue).toBeNull();
		expect(result.error).toContain("XSRF check failed");
		expect(result.error).not.toContain("Unexpected token");
	});

	it("surfaces a network failure", async () => {
		mockedRequestUrl.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
		const result = await fetchJiraIssueDetail(EMAIL, TOKEN, "TAXONOMY-1234");
		expect(result.issue).toBeNull();
		expect(result.error).toContain("ENOTFOUND");
	});
});
