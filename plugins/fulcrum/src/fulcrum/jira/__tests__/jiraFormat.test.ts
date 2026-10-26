import {describe, expect, it} from "vitest";
import {
	JIRA_SCOPE_JQL,
	adfContainsMention,
	adfToPlainText,
	clampExcerpt,
	jiraAssignedJql,
	jiraBasicAuthHeader,
	jiraBrowseUrl,
	jiraCommentUrl,
	jiraErrorDetail,
	jiraFieldMatchesIssueKey,
	jiraMentionScanJql,
	sortJiraActivityNewestFirst,
} from "../jiraFormat";

describe("jiraAssignedJql", () => {
	it("scopes to TAXONOMY and UCP/Core Library, open issues assigned to the token", () => {
		const jql = jiraAssignedJql();
		expect(jql).toContain("assignee = currentUser()");
		expect(jql).toContain(JIRA_SCOPE_JQL);
		expect(jql).toContain("statusCategory != Done");
		expect(jql).toContain("ORDER BY updated DESC");
	});
});

describe("jiraMentionScanJql", () => {
	it("scopes to the same projects within the lookback window, including Done issues", () => {
		const jql = jiraMentionScanJql(14);
		expect(jql).toContain(JIRA_SCOPE_JQL);
		expect(jql).toContain("updated >= -14d");
		expect(jql).not.toContain("statusCategory");
	});

	it("defaults to 14 days", () => {
		expect(jiraMentionScanJql()).toContain("-14d");
	});
});

describe("jiraBrowseUrl / jiraCommentUrl", () => {
	it("builds the ticket link", () => {
		expect(jiraBrowseUrl("TAXONOMY-1234")).toBe("https://deept.atlassian.net/browse/TAXONOMY-1234");
	});

	it("builds a deep link to the specific comment", () => {
		expect(jiraCommentUrl("TAXONOMY-1234", "10099")).toBe(
			"https://deept.atlassian.net/browse/TAXONOMY-1234?focusedCommentId=10099",
		);
	});
});

const myAccountId = "abc-123";

describe("adfContainsMention", () => {
	it("finds a mention nested inside paragraphs", () => {
		const body = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{type: "text", text: "Hey "},
						{type: "mention", attrs: {id: myAccountId, text: "@Jimmy"}},
						{type: "text", text: ", can you take a look?"},
					],
				},
			],
		};
		expect(adfContainsMention(body, myAccountId)).toBe(true);
	});

	it("returns false when the mention targets someone else", () => {
		const body = {
			type: "doc",
			content: [{type: "paragraph", content: [{type: "mention", attrs: {id: "someone-else"}}]}],
		};
		expect(adfContainsMention(body, myAccountId)).toBe(false);
	});

	it("returns false for plain-text comments with no mentions", () => {
		const body = {type: "doc", content: [{type: "paragraph", content: [{type: "text", text: "No mentions here."}]}]};
		expect(adfContainsMention(body, myAccountId)).toBe(false);
	});

	it("is safe against missing/malformed bodies", () => {
		expect(adfContainsMention(undefined, myAccountId)).toBe(false);
		expect(adfContainsMention(null, myAccountId)).toBe(false);
		expect(adfContainsMention("plain string", myAccountId)).toBe(false);
	});
});

describe("adfToPlainText", () => {
	it("joins paragraph text and renders the mention as @name", () => {
		const body = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{type: "text", text: "Hey "},
						{type: "mention", attrs: {id: myAccountId, text: "@Jimmy"}},
						{type: "text", text: ", can you take a look?"},
					],
				},
			],
		};
		expect(adfToPlainText(body)).toBe("Hey @Jimmy, can you take a look?");
	});

	it("separates block paragraphs with newlines and honors hard breaks", () => {
		const body = {
			type: "doc",
			content: [
				{type: "paragraph", content: [{type: "text", text: "Line one"}]},
				{type: "paragraph", content: [{type: "text", text: "Line two"}, {type: "hardBreak"}, {type: "text", text: "Line three"}]},
			],
		};
		expect(adfToPlainText(body)).toBe("Line one\nLine two\nLine three");
	});
});

describe("clampExcerpt", () => {
	it("passes short text through unchanged", () => {
		expect(clampExcerpt("Short comment")).toBe("Short comment");
	});

	it("keeps only the first N non-empty lines and marks truncation", () => {
		const text = "Line 1\n\nLine 2\nLine 3\nLine 4";
		expect(clampExcerpt(text, 2)).toBe("Line 1\nLine 2…");
	});

	it("clamps by character count even within the line limit", () => {
		const long = "x".repeat(300);
		const out = clampExcerpt(long, 3, 50);
		expect(out.length).toBe(50);
		expect(out.endsWith("…")).toBe(true);
	});

	it("returns empty string for blank input", () => {
		expect(clampExcerpt("   \n  ")).toBe("");
	});
});

describe("jiraBasicAuthHeader", () => {
	it("base64-encodes email:token for Jira Cloud Basic auth (not Bearer)", () => {
		const header = jiraBasicAuthHeader("jimmy.little@disney.com", "my-api-token");
		expect(header).toBe(`Basic ${btoa("jimmy.little@disney.com:my-api-token")}`);
		expect(header.startsWith("Basic ")).toBe(true);
		expect(header).not.toContain("Bearer");
		// Decodes back to the original "email:token" pair.
		expect(atob(header.slice("Basic ".length))).toBe("jimmy.little@disney.com:my-api-token");
	});
});

describe("jiraErrorDetail", () => {
	it("joins errorMessages", () => {
		expect(jiraErrorDetail({errorMessages: ["You do not have permission to view this issue."]})).toBe(
			"You do not have permission to view this issue.",
		);
	});

	it("joins field-level errors as 'field: reason'", () => {
		expect(jiraErrorDetail({errors: {project: "Specify a project"}})).toBe("project: Specify a project");
	});

	it("combines both when present", () => {
		expect(
			jiraErrorDetail({errorMessages: ["Bad request"], errors: {jql: "not valid"}}),
		).toBe("Bad request; jql: not valid");
	});

	it("returns null for empty, missing, or unrecognized shapes", () => {
		expect(jiraErrorDetail(undefined)).toBeNull();
		expect(jiraErrorDetail(null)).toBeNull();
		expect(jiraErrorDetail({})).toBeNull();
		expect(jiraErrorDetail("plain string")).toBeNull();
		expect(jiraErrorDetail({errorMessages: []})).toBeNull();
	});
});

describe("jiraFieldMatchesIssueKey", () => {
	it("matches a bare key, case-insensitively", () => {
		expect(jiraFieldMatchesIssueKey("TAXONOMY-1234", "taxonomy-1234")).toBe(true);
		expect(jiraFieldMatchesIssueKey("taxonomy-1234", "TAXONOMY-1234")).toBe(true);
	});

	it("matches a full browse URL ending in the issue key", () => {
		expect(
			jiraFieldMatchesIssueKey("https://deept.atlassian.net/browse/TAXONOMY-1234", "TAXONOMY-1234"),
		).toBe(true);
	});

	it("does not match a different issue, or a key that's only a suffix of another key", () => {
		expect(jiraFieldMatchesIssueKey("TAXONOMY-1234", "TAXONOMY-123")).toBe(false);
		expect(
			jiraFieldMatchesIssueKey("https://deept.atlassian.net/browse/TAXONOMY-1234", "AXONOMY-1234"),
		).toBe(false);
	});

	it("is false for empty, missing, or blank values", () => {
		expect(jiraFieldMatchesIssueKey(null, "TAXONOMY-1234")).toBe(false);
		expect(jiraFieldMatchesIssueKey(undefined, "TAXONOMY-1234")).toBe(false);
		expect(jiraFieldMatchesIssueKey("   ", "TAXONOMY-1234")).toBe(false);
		expect(jiraFieldMatchesIssueKey("TAXONOMY-1234", "")).toBe(false);
	});
});

describe("sortJiraActivityNewestFirst", () => {
	it("orders newest timestamp first without mutating the input", () => {
		const input = [
			{timestampIso: "2026-10-01T10:00:00.000Z", id: "old"},
			{timestampIso: "2026-10-20T10:00:00.000Z", id: "new"},
			{timestampIso: "2026-10-10T10:00:00.000Z", id: "mid"},
		];
		const sorted = sortJiraActivityNewestFirst(input);
		expect(sorted.map((x) => x.id)).toEqual(["new", "mid", "old"]);
		expect(input.map((x) => x.id)).toEqual(["old", "new", "mid"]);
	});
});
