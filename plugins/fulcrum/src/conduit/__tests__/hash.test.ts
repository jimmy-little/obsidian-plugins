import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	requestUrl: vi.fn(),
}));

import {reminderFingerprintsEqual, reminderSyncHash} from "../hash";
import {normalizeHttpReminder} from "../remindersBridge";

describe("reminderSyncHash", () => {
	it("normalizes title, dates, and empty list id", () => {
		const a = reminderSyncHash({
			title: "  Buy milk ",
			due: "2026-08-18T17:00:00Z",
			completed: false,
			listId: "  ",
		});
		const b = reminderSyncHash({
			title: "Buy milk",
			due: "2026-08-18",
			completed: false,
			listId: null,
		});
		expect(a).toBe(b);
	});

	it("treats completed as a fingerprint change", () => {
		const open = reminderSyncHash({
			title: "Ship",
			due: null,
			completed: false,
			listId: "p1",
		});
		const done = reminderSyncHash({
			title: "Ship",
			due: null,
			completed: true,
			listId: "p1",
		});
		expect(open).not.toBe(done);
		expect(
			reminderFingerprintsEqual(
				{title: "Ship", due: null, completed: true, listId: "p1"},
				{title: "Ship", due: null, completed: true, listId: "p1"},
			),
		).toBe(true);
	});
});

describe("normalizeHttpReminder", () => {
	it("keeps EventKit string ids", () => {
		const rem = normalizeHttpReminder({
			id: "A1B2-C3D4",
			title: "Call",
			completed: false,
			dueDate: "2026-09-08",
			notes: "",
			listId: "list-1",
			lastModified: "2026-09-08T17:00:00Z",
			externalId: "ext-1",
			recurring: false,
		});
		expect(rem?.id).toBe("A1B2-C3D4");
		expect(rem?.externalId).toBe("ext-1");
	});

	it("does not accept a row with no id", () => {
		expect(normalizeHttpReminder({title: "Nope", completed: false})).toBeNull();
	});
});
