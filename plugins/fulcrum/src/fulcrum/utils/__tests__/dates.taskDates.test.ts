import {describe, expect, it} from "vitest";
import {taskHasDateOn, taskIsPastOpen} from "../dates";

describe("taskHasDateOn", () => {
	it("matches due or scheduled on the given day", () => {
		expect(taskHasDateOn({dueDate: "2026-09-02"}, "2026-09-02")).toBe(true);
		expect(taskHasDateOn({scheduledDate: "2026-09-02T14:00"}, "2026-09-02")).toBe(true);
		expect(taskHasDateOn({dueDate: "2026-09-03", scheduledDate: "2026-09-02"}, "2026-09-02")).toBe(
			true,
		);
		expect(taskHasDateOn({dueDate: "2026-09-03"}, "2026-09-02")).toBe(false);
		expect(taskHasDateOn({}, "2026-09-02")).toBe(false);
	});
});

describe("taskIsPastOpen", () => {
	const today = "2026-09-02";

	it("treats a past due as overdue", () => {
		expect(taskIsPastOpen({dueDate: "2026-09-01"}, today)).toBe(true);
	});

	it("treats a past scheduled date as overdue when there is no due", () => {
		expect(taskIsPastOpen({scheduledDate: "2026-08-30"}, today)).toBe(true);
	});

	it("does not treat today as overdue even if the other date is past", () => {
		expect(taskIsPastOpen({dueDate: "2026-09-01", scheduledDate: "2026-09-02"}, today)).toBe(false);
		expect(taskIsPastOpen({dueDate: "2026-09-02", scheduledDate: "2026-08-01"}, today)).toBe(false);
	});

	it("ignores future dates and undated tasks", () => {
		expect(taskIsPastOpen({dueDate: "2026-09-10"}, today)).toBe(false);
		expect(taskIsPastOpen({scheduledDate: "2026-09-10"}, today)).toBe(false);
		expect(taskIsPastOpen({}, today)).toBe(false);
	});
});
