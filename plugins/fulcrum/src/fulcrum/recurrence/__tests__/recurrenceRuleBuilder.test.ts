import {describe, expect, it} from "vitest";
import {
	buildRecurrenceRule,
	defaultRecurrenceUiState,
	parseRecurrenceToUiState,
} from "../recurrenceRuleBuilder";
import {recurringTaskBasename} from "../recurringTaskBasename";
import {computeNextOccurrences} from "../recurrenceEngine";

describe("buildRecurrenceRule", () => {
	it("builds weekly multi-day rule", () => {
		const state = {...defaultRecurrenceUiState("weekly"), weeklyDays: [2, 4]};
		expect(buildRecurrenceRule(state, "2025-06-12")).toBe(
			"DTSTART:20250612T120000;FREQ=WEEKLY;BYDAY=TU,TH",
		);
	});

	it("builds every 2 weeks on Monday", () => {
		const state = {...defaultRecurrenceUiState("weekly", "2025-06-12"), weeklyDays: [1], interval: 2};
		expect(buildRecurrenceRule(state, "2025-06-12")).toBe(
			"DTSTART:20250616T120000;FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
		);
	});

	it("aligns weekly DTSTART to a selected weekday", () => {
		// 2028-06-11 is Sunday; Friday selected → DTSTART moves to 2028-06-16
		const state = {...defaultRecurrenceUiState("weekly", "2028-06-11"), weeklyDays: [5]};
		expect(buildRecurrenceRule(state, "2028-06-11")).toBe(
			"DTSTART:20280616T120000;FREQ=WEEKLY;BYDAY=FR",
		);
	});

	it("builds monthly on day(s)", () => {
		const state = {
			...defaultRecurrenceUiState("monthly"),
			monthlyMode: "onDays" as const,
			monthlyDays: "15, 30",
		};
		expect(buildRecurrenceRule(state, "2025-06-12")).toBe(
			"DTSTART:20250612T120000;FREQ=MONTHLY;BYMONTHDAY=15,30",
		);
	});

	it("builds monthly last Friday", () => {
		const state = {
			...defaultRecurrenceUiState("monthly"),
			monthlyMode: "lastWeekdayNamed" as const,
			monthlyWeekday: 5,
		};
		expect(buildRecurrenceRule(state, "2025-06-12")).toBe(
			"DTSTART:20250612T120000;FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1",
		);
	});
});

describe("parseRecurrenceToUiState", () => {
	it("round-trips weekly rule", () => {
		const rule = "DTSTART:20250612T120000;FREQ=WEEKLY;BYDAY=TU,TH";
		const parsed = parseRecurrenceToUiState(rule, "2025-06-12");
		expect(parsed?.freq).toBe("weekly");
		expect(parsed?.weeklyDays).toEqual([2, 4]);
	});

	it("parses weekly interval", () => {
		const rule = "DTSTART:20250616T120000;FREQ=WEEKLY;INTERVAL=2;BYDAY=MO";
		const parsed = parseRecurrenceToUiState(rule, "2025-06-12");
		expect(parsed?.interval).toBe(2);
		expect(parsed?.weeklyDays).toEqual([1]);
	});

	it("parses monthly first weekday", () => {
		const rule = "DTSTART:20250612;FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1";
		const parsed = parseRecurrenceToUiState(rule);
		expect(parsed?.monthlyMode).toBe("firstWeekday");
	});

	it("parses monthly on day(s)", () => {
		const rule = "DTSTART:20250612;FREQ=MONTHLY;BYMONTHDAY=15,30";
		const parsed = parseRecurrenceToUiState(rule);
		expect(parsed?.monthlyMode).toBe("onDays");
		expect(parsed?.monthlyDays).toBe("15, 30");
	});
});

describe("recurringTaskBasename", () => {
	it("replaces date prefix with Recurring-", () => {
		expect(recurringTaskBasename("2025-02-15 Weekly review.md")).toBe("Recurring-Weekly review.md");
		expect(recurringTaskBasename("2025-02-15-Weekly-review.md")).toBe("Recurring-Weekly-review.md");
	});

	it("no-ops when already Recurring-", () => {
		expect(recurringTaskBasename("Recurring-Weekly review.md")).toBe("Recurring-Weekly review.md");
	});
});

describe("computeNextOccurrences", () => {
	it("returns up to three upcoming dates", () => {
		const now = new Date();
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		const rule = `DTSTART:${today.replace(/-/g, "")}T120000;FREQ=DAILY`;
		const next = computeNextOccurrences(rule, today, [], [], 3);
		expect(next).toHaveLength(3);
		expect(next[0]).toBe(today);
	});

	it("returns three distinct weekly dates", () => {
		const state = {...defaultRecurrenceUiState("weekly", "2028-06-11"), weeklyDays: [5]};
		const rule = buildRecurrenceRule(state, "2028-06-11");
		const next = computeNextOccurrences(rule, "2028-06-11", [], [], 3);
		expect(next).toHaveLength(3);
		expect(new Set(next).size).toBe(3);
		const d0 = Date.parse(next[0]! + "T12:00:00");
		const d1 = Date.parse(next[1]! + "T12:00:00");
		const d2 = Date.parse(next[2]! + "T12:00:00");
		expect(d1 - d0).toBe(7 * 86_400_000);
		expect(d2 - d1).toBe(7 * 86_400_000);
	});
});
