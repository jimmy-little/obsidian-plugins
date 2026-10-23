import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import type {App} from "obsidian";
import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import type {IndexedProject} from "../../fulcrum/types";
import {
	ofTaskFingerprint,
	omnifocusProjectOpenUrl,
	readInlineOmniId,
	readProjectOmniFocusLink,
	readYamlScalar,
	withInlineOmniId,
} from "../mapping";
import {syncHash} from "../hash";

describe("omnifocus mapping fingerprints", () => {
	it("hashes OmniFocus tasks with null dates as empty", () => {
		const fp = ofTaskFingerprint({
			name: "Inbox capture",
			due: null,
			defer: undefined,
			completed: false,
			projectId: null,
		});
		expect(fp.defer).toBeNull();
		expect(syncHash(fp)).toBe("Inbox capture\n\n\n0\n");
	});
});

describe("inline OmniFocus ids", () => {
	it("appends and reads a comment id", () => {
		const line = withInlineOmniId("- [ ] Ship release", "abc123");
		expect(line).toContain("<!-- omnifocus-id: abc123 -->");
		expect(readInlineOmniId(line)).toBe("abc123");
	});

	it("replaces an existing comment id", () => {
		const first = withInlineOmniId("- [ ] Ship release", "aaa");
		const next = withInlineOmniId(first, "bbb");
		expect(readInlineOmniId(next)).toBe("bbb");
		expect(next.match(/omnifocus-id/g)?.length).toBe(1);
	});
});

describe("readYamlScalar", () => {
	it("reads unquoted and quoted OmniFocus ids", () => {
		expect(readYamlScalar("omnifocusProjectId: kR8mAbCd\n", "omnifocusProjectId")).toBe("kR8mAbCd");
		expect(
			readYamlScalar('omnifocusProjectId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"\n', "omnifocusProjectId"),
		).toBe("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
	});
});

describe("omnifocusProjectOpenUrl", () => {
	it("builds an OmniFocus task URL from a project primary key", () => {
		expect(omnifocusProjectOpenUrl("h-0aeEd7j4D")).toBe("omnifocus:///task/h-0aeEd7j4D");
	});

	it("passes through existing omnifocus URLs", () => {
		expect(omnifocusProjectOpenUrl("omnifocus:///task/h-abc")).toBe("omnifocus:///task/h-abc");
	});
});

describe("readProjectOmniFocusLink", () => {
	function stub(enabled: boolean): {app: App; project: IndexedProject; settings: FulcrumSettings} {
		const app = {
			metadataCache: {
				getFileCache: () => ({frontmatter: {omnifocusProjectId: "h-abc"}}),
			},
		} as unknown as App;
		const project = {file: {path: "p.md"}} as IndexedProject;
		const settings = {
			omnifocusEnabled: enabled,
			omnifocusProjectIdField: "omnifocusProjectId",
		} as FulcrumSettings;
		return {app, project, settings};
	}

	it("returns null when OmniFocus sync is disabled", () => {
		const {app, project, settings} = stub(false);
		expect(readProjectOmniFocusLink(app, project, settings)).toBeNull();
	});

	it("returns a deep link when OmniFocus sync is enabled", () => {
		const {app, project, settings} = stub(true);
		expect(readProjectOmniFocusLink(app, project, settings)).toEqual({
			href: "omnifocus:///task/h-abc",
			id: "h-abc",
		});
	});
});
