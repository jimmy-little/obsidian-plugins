import {describe, expect, it} from "vitest";
import {isoDatePrefix, taskBelongsOnToday, taskHasDateOn, taskIsPastOpen} from "../dates";

describe("isoDatePrefix", () => {
	it("returns the calendar day from a datetime string", () => {
		expect(isoDatePrefix("2026-06-08T09:00")).toBe("2026-06-08");
	});

	it("returns null for missing or invalid values", () => {
		expect(isoDatePrefix(undefined)).toBeNull();
		expect(isoDatePrefix("soon")).toBeNull();
	});
});

describe("taskHasDateOn", () => {
	it("matches due or scheduled on that day", () => {
		expect(taskHasDateOn({dueDate: "2026-09-04", scheduledDate: "2026-09-01"}, "2026-09-04")).toBe(
			true,
		);
		expect(taskHasDateOn({scheduledDate: "2026-09-04T08:35"}, "2026-09-04")).toBe(true);
		expect(taskHasDateOn({dueDate: "2026-09-03"}, "2026-09-04")).toBe(false);
	});
});

describe("taskIsPastOpen", () => {
	const today = "2026-09-04";

	it("treats a past due date as overdue", () => {
		expect(taskIsPastOpen({dueDate: "2026-06-08", scheduledDate: "2026-09-10"}, today)).toBe(true);
	});

	it("treats a past scheduled date as overdue when there is no due date", () => {
		expect(taskIsPastOpen({scheduledDate: "2026-09-03"}, today)).toBe(true);
	});

	it("does not treat a future due as overdue even if scheduled is past", () => {
		expect(taskIsPastOpen({dueDate: "2026-09-10", scheduledDate: "2026-09-01"}, today)).toBe(false);
	});
});

describe("taskBelongsOnToday", () => {
	const today = "2026-09-04";

	it("includes overdue and today-dated open tasks", () => {
		expect(taskBelongsOnToday({dueDate: "2026-06-08"}, today)).toBe(true);
		expect(taskBelongsOnToday({dueDate: "2026-09-04"}, today)).toBe(true);
		expect(taskBelongsOnToday({dueDate: "2026-09-10"}, today)).toBe(false);
	});
});
