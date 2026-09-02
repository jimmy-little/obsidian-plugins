import {describe, expect, it} from "vitest";
import {fingerprintsEqual, syncHash} from "../hash";

describe("omnifocus syncHash", () => {
	it("normalizes title, dates, and empty project id", () => {
		const a = syncHash({
			title: "  Buy milk ",
			due: "2026-08-18T17:00:00Z",
			defer: null,
			completed: false,
			projectId: "  ",
		});
		const b = syncHash({
			title: "Buy milk",
			due: "2026-08-18",
			defer: null,
			completed: false,
			projectId: null,
		});
		expect(a).toBe(b);
	});

	it("treats completed as a fingerprint change", () => {
		const open = syncHash({
			title: "Ship",
			due: null,
			defer: null,
			completed: false,
			projectId: "p1",
		});
		const done = syncHash({
			title: "Ship",
			due: null,
			defer: null,
			completed: true,
			projectId: "p1",
		});
		expect(open).not.toBe(done);
		expect(
			fingerprintsEqual(
				{title: "Ship", due: null, defer: null, completed: true, projectId: "p1"},
				{title: "Ship", due: null, defer: null, completed: true, projectId: "p1"},
			),
		).toBe(true);
	});
});
