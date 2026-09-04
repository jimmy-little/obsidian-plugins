import {describe, expect, it} from "vitest";
import {buildTodayWeekDays, formatTodayMasthead, shiftIsoWeek} from "../todayWeek";

describe("formatTodayMasthead", () => {
	it("formats day number and month weekday", () => {
		const mast = formatTodayMasthead("2026-09-04");
		expect(mast.dayNum).toBe("4");
		expect(mast.monthWeekday).toBe("SEPTEMBER FRIDAY");
	});
});

describe("buildTodayWeekDays", () => {
	it("returns the Sunday-start week containing the focal day", () => {
		const days = buildTodayWeekDays("2026-09-04", 0, "2026-09-04");
		expect(days).toHaveLength(7);
		expect(days[0]?.iso).toBe("2026-08-30");
		expect(days[5]?.iso).toBe("2026-09-04");
		expect(days[5]?.isToday).toBe(true);
		expect(days[5]?.isFocal).toBe(true);
	});

	it("starts on Monday when weekStartDay is 1", () => {
		const days = buildTodayWeekDays("2026-09-04", 1, "2026-09-04");
		expect(days[0]?.iso).toBe("2026-08-31");
		expect(days[4]?.iso).toBe("2026-09-04");
	});
});

describe("shiftIsoWeek", () => {
	it("moves by whole weeks", () => {
		expect(shiftIsoWeek("2026-09-04", 1)).toBe("2026-09-11");
		expect(shiftIsoWeek("2026-09-04", -1)).toBe("2026-08-28");
	});
});
