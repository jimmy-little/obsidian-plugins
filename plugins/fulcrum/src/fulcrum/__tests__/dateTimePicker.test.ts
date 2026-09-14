import {describe, expect, it} from "vitest";
import {
	buildPickerMonthCells,
	parsePickerIsoDate,
	parsePickerIsoTime,
	shiftViewMonth,
	viewMonthFromIso,
} from "../dateTimePicker";
import {isoForTaskDatePreset} from "../taskSchedulePresets";

describe("parsePickerIsoDate / time", () => {
	it("keeps a calendar date and strips a time suffix", () => {
		expect(parsePickerIsoDate("2026-09-16T09:30")).toBe("2026-09-16");
		expect(parsePickerIsoDate("soon")).toBe("");
	});

	it("reads HH:MM from a datetime or a time-only value", () => {
		expect(parsePickerIsoTime("2026-09-16T09:30")).toBe("09:30");
		expect(parsePickerIsoTime("09:30")).toBe("09:30");
		expect(parsePickerIsoTime("")).toBe("");
	});
});

describe("viewMonthFromIso", () => {
	it("parses year/month from an iso date", () => {
		expect(viewMonthFromIso("2026-09-16")).toEqual({year: 2026, month: 8});
	});

	it("falls back when the value is empty", () => {
		expect(viewMonthFromIso("", new Date("2026-01-15T12:00:00"))).toEqual({year: 2026, month: 0});
	});
});

describe("shiftViewMonth", () => {
	it("wraps across year boundaries", () => {
		expect(shiftViewMonth(2026, 0, -1)).toEqual({year: 2025, month: 11});
		expect(shiftViewMonth(2026, 11, 1)).toEqual({year: 2027, month: 0});
	});
});

describe("buildPickerMonthCells", () => {
	it("builds a 6-week grid with today and selected highlighted", () => {
		const cells = buildPickerMonthCells({
			viewYear: 2026,
			viewMonth: 8,
			weekStartDay: 1,
			selectedIso: "2026-09-16",
			todayIso: "2026-09-14",
		});
		expect(cells).toHaveLength(42);
		expect(cells[0]?.iso).toBe("2026-08-31");
		expect(cells[0]?.inMonth).toBe(false);
		const selected = cells.find((c) => c.iso === "2026-09-16");
		const today = cells.find((c) => c.iso === "2026-09-14");
		expect(selected?.isSelected).toBe(true);
		expect(selected?.isToday).toBe(false);
		expect(today?.isToday).toBe(true);
		expect(today?.isSelected).toBe(false);
		expect(today?.inMonth).toBe(true);
	});

	it("treats the selected day as both today and selected when they match", () => {
		const cells = buildPickerMonthCells({
			viewYear: 2026,
			viewMonth: 8,
			weekStartDay: 1,
			selectedIso: "2026-09-14",
			todayIso: "2026-09-14",
		});
		const day = cells.find((c) => c.iso === "2026-09-14");
		expect(day?.isToday).toBe(true);
		expect(day?.isSelected).toBe(true);
	});
});

describe("isoForTaskDatePreset", () => {
	const wednesday = new Date("2026-09-16T15:00:00");

	it("maps today / tomorrow / this weekend / next week", () => {
		expect(isoForTaskDatePreset("today", 1, wednesday)).toBe("2026-09-16");
		expect(isoForTaskDatePreset("tomorrow", 1, wednesday)).toBe("2026-09-17");
		expect(isoForTaskDatePreset("weekend", 1, wednesday)).toBe("2026-09-19");
		expect(isoForTaskDatePreset("nextWeek", 1, wednesday)).toBe("2026-09-21");
	});

	it("keeps Saturday as this weekend", () => {
		expect(isoForTaskDatePreset("weekend", 1, new Date("2026-09-19T09:00:00"))).toBe("2026-09-19");
	});
});
