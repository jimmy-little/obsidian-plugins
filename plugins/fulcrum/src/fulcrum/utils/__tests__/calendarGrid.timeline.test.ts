import {describe, expect, it} from "vitest";
import {
	layoutTimedBlockInWindow,
	parseTime24h,
	resolveTimelineDisplayWindow,
	timeGridNowLineTopPercentInWindow,
} from "../calendarGrid";

describe("parseTime24h", () => {
	it("parses valid HH:MM", () => {
		expect(parseTime24h("05:00")).toEqual({hour: 5, minute: 0});
		expect(parseTime24h("23:59")).toEqual({hour: 23, minute: 59});
	});

	it("rejects invalid values", () => {
		expect(parseTime24h("25:00")).toBeNull();
		expect(parseTime24h("noon")).toBeNull();
	});
});

describe("resolveTimelineDisplayWindow", () => {
	it("maps 05:00 + 16 hours to 5:00–21:00", () => {
		const w = resolveTimelineDisplayWindow("05:00", 16);
		expect(w.startMinutes).toBe(5 * 60);
		expect(w.hourCount).toBe(16);
		expect(w.totalMinutes).toBe(16 * 60);
		expect(w.rowStartMinutes[0]).toBe(5 * 60);
		expect(w.rowStartMinutes[15]).toBe(20 * 60);
	});

	it("caps display at midnight", () => {
		const w = resolveTimelineDisplayWindow("20:00", 16);
		expect(w.startMinutes).toBe(20 * 60);
		expect(w.totalMinutes).toBe(4 * 60);
		expect(w.hourCount).toBe(4);
	});
});

describe("layoutTimedBlockInWindow", () => {
	const window = resolveTimelineDisplayWindow("05:00", 16);

	it("positions a block inside the window", () => {
		const layout = layoutTimedBlockInWindow(9 * 60, 60, window);
		expect(layout).not.toBeNull();
		expect(layout!.topPct).toBeCloseTo(((4 * 60) / window.totalMinutes) * 100);
		expect(layout!.heightPct).toBeCloseTo((60 / window.totalMinutes) * 100);
	});

	it("returns null for blocks outside the window", () => {
		expect(layoutTimedBlockInWindow(3 * 60, 30, window)).toBeNull();
		expect(layoutTimedBlockInWindow(22 * 60, 30, window)).toBeNull();
	});
});

describe("timeGridNowLineTopPercentInWindow", () => {
	it("returns null when now is outside the window", () => {
		const w = resolveTimelineDisplayWindow("05:00", 16);
		const d = new Date("2026-01-01T03:00:00");
		expect(timeGridNowLineTopPercentInWindow(w, d)).toBeNull();
	});
});
