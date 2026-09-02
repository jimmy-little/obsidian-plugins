import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	MarkdownView: class MarkdownView {},
}));

import {inlineTaskDisplayTitle} from "../inlineTasks";

describe("inlineTaskDisplayTitle", () => {
	it("keeps page wikilink text but removes +[[project]] and tags", () => {
		expect(
			inlineTaskDisplayTitle(
				"Read up on [[OIDC]] and populate document #task +[[Maestro Auth KT]]",
			),
		).toBe("Read up on OIDC and populate document");
	});
	it("strips HTML comments such as omnifocus-id metadata", () => {
		expect(
			inlineTaskDisplayTitle(
				"Follow up with team <!-- omnifocus-id: abc123 --> +[[My Project]]",
			),
		).toBe("Follow up with team");
	});
});
