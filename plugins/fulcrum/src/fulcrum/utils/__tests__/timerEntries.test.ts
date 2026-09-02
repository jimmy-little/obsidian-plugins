import {describe, expect, it} from "vitest";
import {
	applyCompletedMemoryOverrides,
	parseTimerTimestampMs,
	readTimerEntriesFromFm,
	resolveEntriesWriteKey,
	shiftRunningTimerStart,
} from "../timerEntries";
import type {TimeEntry} from "../../../timer/types";
import {DEFAULT_TIMER_SETTINGS} from "../../../timer/settings";

describe("resolveEntriesWriteKey", () => {
	it("always returns the primary entries key", () => {
		expect(resolveEntriesWriteKey(DEFAULT_TIMER_SETTINGS)).toBe("timeEntries");
	});

	it("ignores legacy frontmatter when choosing write key", () => {
		const timer = {
			...DEFAULT_TIMER_SETTINGS,
			entriesKey: "timeEntries",
		};
		expect(resolveEntriesWriteKey(timer)).toBe("timeEntries");
	});
});

describe("applyCompletedMemoryOverrides", () => {
	it("keeps completed in-memory entry when frontmatter still shows running", () => {
		const staleFm: TimeEntry[] = [
			{
				id: "note-0-100",
				label: "Day Planning",
				startTime: 100,
				endTime: null,
				duration: 0,
				isPaused: false,
				tags: [],
			},
		];
		const completed: TimeEntry[] = [
			{
				id: "note-0-100",
				label: "Day Planning",
				startTime: 100,
				endTime: 500,
				duration: 400,
				isPaused: false,
				tags: [],
			},
		];
		const merged = applyCompletedMemoryOverrides(staleFm, completed);
		expect(merged).toHaveLength(1);
		expect(merged[0]!.endTime).toBe(500);
	});

	it("does not override a still-running frontmatter entry without a completed memory match", () => {
		// Start times a full second apart: matching is second-precision because
		// frontmatter timestamps round-trip at second precision.
		const fm: TimeEntry[] = [
			{
				id: "other",
				label: "Other",
				startTime: 200_000,
				endTime: null,
				duration: 0,
				isPaused: false,
				tags: [],
			},
		];
		const completed: TimeEntry[] = [
			{
				id: "note-0-100000",
				label: "Day Planning",
				startTime: 100_000,
				endTime: 500_000,
				duration: 400_000,
				isPaused: false,
				tags: [],
			},
		];
		const merged = applyCompletedMemoryOverrides(fm, completed);
		expect(merged[0]!.endTime).toBeNull();
	});

	it("closes a stale running frontmatter row whose start matches at second precision", () => {
		// In-memory start keeps ms precision; frontmatter dropped them.
		const fm: TimeEntry[] = [
			{
				id: "note-0-100000",
				label: "Day Planning",
				startTime: 100_000,
				endTime: null,
				duration: 0,
				isPaused: false,
				tags: [],
			},
		];
		const completed: TimeEntry[] = [
			{
				id: "note-0-100647",
				label: "Day Planning",
				startTime: 100_647,
				endTime: 500_647,
				duration: 400_000,
				isPaused: false,
				tags: [],
			},
		];
		const merged = applyCompletedMemoryOverrides(fm, completed);
		expect(merged).toHaveLength(1);
		expect(merged[0]!.endTime).toBe(500_647);
	});
});

describe("parseTimerTimestampMs", () => {
	it("parses YAML Date objects that Obsidian stores for unquoted datetimes", () => {
		const start = new Date(2024, 7, 24, 10, 18, 0);
		expect(parseTimerTimestampMs(start)).toBe(start.getTime());
	});

	it("parses ISO strings and epoch milliseconds", () => {
		expect(parseTimerTimestampMs("2024-08-24T10:18:00")).toBe(Date.parse("2024-08-24T10:18:00"));
		expect(parseTimerTimestampMs(1_724_500_000_000)).toBe(1_724_500_000_000);
	});
});

describe("shiftRunningTimerStart", () => {
	it("moves start earlier by a positive offset (more elapsed)", () => {
		const start = Date.now() - 10 * 60_000;
		expect(shiftRunningTimerStart(start, 5, Date.now())).toBe(start - 5 * 60_000);
	});

	it("rejects a negative offset that would start in the future", () => {
		const start = Date.now() - 60_000;
		expect(shiftRunningTimerStart(start, -5, Date.now())).toBeNull();
	});
});

describe("readTimerEntriesFromFm Date timestamps", () => {
	it("treats a YAML Date startTime with no endTime as a running entry", () => {
		const start = new Date(2024, 7, 24, 10, 18, 0);
		const entries = readTimerEntriesFromFm(
			{
				timeEntries: [{description: "Work", startTime: start}],
			},
			DEFAULT_TIMER_SETTINGS,
			"Tasks/Work.md",
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]!.startTime).toBe(start.getTime());
		expect(entries[0]!.endTime).toBeNull();
	});
});
