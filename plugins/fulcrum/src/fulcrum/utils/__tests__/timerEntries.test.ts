import {describe, expect, it} from "vitest";
import {applyCompletedMemoryOverrides, resolveEntriesWriteKey} from "../timerEntries";
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
		const fm: TimeEntry[] = [
			{
				id: "other",
				label: "Other",
				startTime: 200,
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
		const merged = applyCompletedMemoryOverrides(fm, completed);
		expect(merged[0]!.endTime).toBeNull();
	});
});
