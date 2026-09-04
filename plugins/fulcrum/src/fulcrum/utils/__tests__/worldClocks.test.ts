import {describe, expect, it} from "vitest";
import {
	isDaytimeInTimeZone,
	occurrenceIsPast,
	parseWorldClockSettings,
} from "../worldClocks";

describe("parseWorldClockSettings", () => {
	it("parses label|zone pairs", () => {
		expect(parseWorldClockSettings("Washington|America/New_York,Paris|Europe/Paris,HOME|")).toEqual([
			{label: "Washington", timeZone: "America/New_York"},
			{label: "Paris", timeZone: "Europe/Paris"},
			{label: "HOME", timeZone: null},
		]);
	});
});

describe("isDaytimeInTimeZone", () => {
	it("treats 7:00–18:59 as day in the given zone", () => {
		const morning = new Date("2026-09-04T11:21:00Z"); // 07:21 in America/New_York (EDT)
		expect(isDaytimeInTimeZone(morning, "America/New_York")).toBe(true);
		const evening = new Date("2026-09-04T23:21:00Z"); // 19:21 in America/New_York
		expect(isDaytimeInTimeZone(evening, "America/New_York")).toBe(false);
	});
});

describe("occurrenceIsPast", () => {
	it("marks a timed block past after it ends", () => {
		const now = new Date("2026-09-04T10:21:00");
		expect(occurrenceIsPast("2026-09-04", 8 * 60 + 35, 30, now)).toBe(true);
		expect(occurrenceIsPast("2026-09-04", 16 * 60 + 55, 30, now)).toBe(false);
	});

	it("does not mark all-day today as past", () => {
		const now = new Date("2026-09-04T10:21:00");
		expect(occurrenceIsPast("2026-09-04", null, null, now)).toBe(false);
	});
});
