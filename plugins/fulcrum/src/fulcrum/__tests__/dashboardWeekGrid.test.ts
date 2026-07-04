import {describe, expect, it} from "vitest";
import {dashboardMeetingGridDates} from "../utils/calendarGrid";

describe("dashboardMeetingGridDates", () => {
	const wednesday = new Date("2026-07-01T12:00:00");

	it("start today full week returns 7 days from today", () => {
		const days = dashboardMeetingGridDates({
			span: "fullWeek",
			anchor: "startToday",
			weekOffset: 0,
			now: wednesday,
		});
		expect(days).toHaveLength(7);
		expect(days[0]?.getDate()).toBe(1);
		expect(days[6]?.getDate()).toBe(7);
	});

	it("start monday work week returns Mon–Fri of calendar week", () => {
		const days = dashboardMeetingGridDates({
			span: "workWeek",
			anchor: "startMonday",
			weekOffset: 0,
			now: wednesday,
		});
		expect(days).toHaveLength(5);
		expect(days[0]?.getDay()).toBe(1);
		expect(days[4]?.getDay()).toBe(5);
	});
});
