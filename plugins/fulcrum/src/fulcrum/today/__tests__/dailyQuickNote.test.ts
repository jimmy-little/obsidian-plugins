import {describe, expect, it} from "vitest";
import {formatDailyQuickNoteLine} from "../dailyQuickNoteFormat";

describe("formatDailyQuickNoteLine", () => {
	it("prefixes a timestamped bullet", () => {
		const line = formatDailyQuickNoteLine("shipped  the  tweak", new Date("2026-09-04T15:31:00"));
		expect(line.startsWith("- ")).toBe(true);
		expect(line.endsWith(" — shipped the tweak")).toBe(true);
	});
});
