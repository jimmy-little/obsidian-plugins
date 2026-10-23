import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {
	isLegacyNumericReminderId,
	parseRemindersOpenTarget,
	readInlineReminderId,
	readProjectRemindersOpenLink,
	readYamlScalar,
	reminderFingerprint,
	remindersListOpenUrl,
	withInlineReminderId,
} from "../mapping";
import {reminderSyncHash} from "../hash";
import type {App} from "obsidian";
import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import type {IndexedProject} from "../../fulcrum/types";

describe("reminder mapping fingerprints", () => {
	it("hashes reminders with null dates as empty", () => {
		const fp = reminderFingerprint({
			id: "abc",
			title: "Inbox capture",
			dueDate: null,
			completed: false,
			notes: "",
			tags: [],
			listId: undefined,
		});
		expect(fp.due).toBeNull();
		expect(reminderSyncHash(fp)).toBe("Inbox capture\n\n0\n");
	});
});

describe("inline reminder ids", () => {
	it("appends and reads a comment id", () => {
		const line = withInlineReminderId("- [ ] Ship release", "uuid-123");
		expect(line).toContain("<!-- reminder-id: uuid-123 -->");
		expect(readInlineReminderId(line)).toBe("uuid-123");
	});

	it("replaces an existing comment id", () => {
		const first = withInlineReminderId("- [ ] Ship release", "aaa");
		const next = withInlineReminderId(first, "bbb");
		expect(readInlineReminderId(next)).toBe("bbb");
		expect(next.match(/reminder-id/g)?.length).toBe(1);
	});
});

describe("legacy remctl numeric ids", () => {
	it("treats integer strings as unusable EventKit ids", () => {
		expect(isLegacyNumericReminderId("42")).toBe(true);
		expect(isLegacyNumericReminderId("A1B2-C3D4")).toBe(false);
		expect(isLegacyNumericReminderId(null)).toBe(false);
	});
});

describe("reminders header open URLs", () => {
	it("opens Apple Reminders with the Reminders URL scheme", () => {
		expect(remindersListOpenUrl("reminders", "Core Library Admin")).toBe("x-apple-reminderkit://");
	});

	it("opens GoodTask with a URL-encoded project name", () => {
		expect(remindersListOpenUrl("goodtask", "Core Library Admin")).toBe(
			"goodtask3://view?title=Core%20Library%20Admin",
		);
		expect(remindersListOpenUrl("goodtask", "Foo & Bar")).toBe("goodtask3://view?title=Foo%20%26%20Bar");
	});

	it("returns null for GoodTask when the project name is empty", () => {
		expect(remindersListOpenUrl("goodtask", "  ")).toBeNull();
	});

	it("treats unknown targets as Reminders", () => {
		expect(parseRemindersOpenTarget("nope")).toBe("reminders");
		expect(parseRemindersOpenTarget("goodtask")).toBe("goodtask");
	});
});

describe("readProjectRemindersOpenLink", () => {
	function stub(opts: {
		enabled: boolean;
		target?: "reminders" | "goodtask";
		listId?: string | null;
	}): {app: App; project: IndexedProject; settings: FulcrumSettings} {
		const app = {
			metadataCache: {
				getFileCache: () => ({
					frontmatter: opts.listId ? {appleReminderListId: opts.listId} : {},
				}),
			},
		} as unknown as App;
		const project = {
			name: "Core Library Admin",
			file: {path: "p.md", basename: "Core Library Admin.md"},
		} as IndexedProject;
		const settings = {
			conduitEnabled: opts.enabled,
			remindersOpenTarget: opts.target ?? "reminders",
			conduitReminderListIdField: "appleReminderListId",
		} as FulcrumSettings;
		return {app, project, settings};
	}

	it("returns null when Reminders sync is disabled", () => {
		const {app, project, settings} = stub({enabled: false, listId: "list-1"});
		expect(readProjectRemindersOpenLink(app, project, settings)).toBeNull();
	});

	it("returns null when no list is linked", () => {
		const {app, project, settings} = stub({enabled: true, listId: null});
		expect(readProjectRemindersOpenLink(app, project, settings)).toBeNull();
	});

	it("opens GoodTask with the encoded project name", () => {
		const {app, project, settings} = stub({
			enabled: true,
			target: "goodtask",
			listId: "list-1",
		});
		expect(readProjectRemindersOpenLink(app, project, settings)).toEqual({
			href: "goodtask3://view?title=Core%20Library%20Admin",
			label: "GoodTask",
			title: "Open in GoodTask (Core Library Admin)",
		});
	});
});

describe("readYamlScalar", () => {
	it("reads unquoted and quoted reminder list ids", () => {
		expect(readYamlScalar("appleReminderListId: kR8mAbCd\n", "appleReminderListId")).toBe("kR8mAbCd");
		expect(
			readYamlScalar(
				'appleReminderListId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"\n',
				"appleReminderListId",
			),
		).toBe("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
	});
});
