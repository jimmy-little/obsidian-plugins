import {describe, expect, it} from "vitest";
import {
	formatLongRunningNotice,
	longRunningReminderBucket,
	longRunningReminderKey,
	shouldNotifyLongRunning,
} from "../longRunningReminder";

const HOUR_MS = 60 * 60_000;

describe("longRunningReminderKey", () => {
	it("uses second-precision start time so reloads share a bucket", () => {
		expect(longRunningReminderKey("note.md", 1_700_000_123_456)).toBe(
			"note.md:1700000123",
		);
		expect(longRunningReminderKey("note.md", 1_700_000_123_999)).toBe(
			"note.md:1700000123",
		);
	});
});

describe("longRunningReminderBucket", () => {
	it("is null before one interval elapses", () => {
		expect(longRunningReminderBucket(HOUR_MS - 1, 60)).toBeNull();
		expect(longRunningReminderBucket(0, 60)).toBeNull();
	});

	it("is 1 at one hour and 2 at two hours for a 60-minute interval", () => {
		expect(longRunningReminderBucket(HOUR_MS, 60)).toBe(1);
		expect(longRunningReminderBucket(2 * HOUR_MS, 60)).toBe(2);
		expect(longRunningReminderBucket(2 * HOUR_MS + 1, 60)).toBe(2);
	});

	it("is null when reminders are off", () => {
		expect(longRunningReminderBucket(3 * HOUR_MS, 0)).toBeNull();
	});
});

describe("shouldNotifyLongRunning", () => {
	it("does not notify before one interval", () => {
		expect(shouldNotifyLongRunning(undefined, HOUR_MS - 1, 60)).toBeNull();
	});

	it("notifies once per crossed interval", () => {
		expect(shouldNotifyLongRunning(undefined, HOUR_MS, 60)).toBe(1);
		expect(shouldNotifyLongRunning(1, HOUR_MS + 1, 60)).toBeNull();
		expect(shouldNotifyLongRunning(1, 2 * HOUR_MS, 60)).toBe(2);
		expect(shouldNotifyLongRunning(2, 2 * HOUR_MS + 30_000, 60)).toBeNull();
	});

	it("does not repeat the same bucket", () => {
		expect(shouldNotifyLongRunning(2, 2 * HOUR_MS, 60)).toBeNull();
	});
});

describe("formatLongRunningNotice", () => {
	it("includes label, project, and elapsed", () => {
		expect(
			formatLongRunningNotice({
				label: "Write spec",
				project: "Fulcrum",
				elapsed: "1:02:13",
			}),
		).toBe("Timer still running: Write spec — Fulcrum (1:02:13)");
	});
});
