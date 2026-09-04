import {describe, expect, it} from "vitest";
import {formatWorldClockTime, isValidTimeZone, parseWorldClocks} from "../worldClocks";

describe("parseWorldClocks", () => {
	it("parses label|zone lines and skips invalid zones", () => {
		const clocks = parseWorldClocks(
			"Washington|America/New_York\nParis|Europe/Paris\nbad|Not/AZone\n# comment\nPT|America/Los_Angeles",
		);
		expect(clocks.map((c) => c.label)).toEqual(["Washington", "Paris", "PT"]);
		expect(clocks[1]?.timeZone).toBe("Europe/Paris");
	});

	it("dedupes identical label+zone", () => {
		const clocks = parseWorldClocks("Paris|Europe/Paris\nParis|Europe/Paris");
		expect(clocks).toHaveLength(1);
	});
});

describe("isValidTimeZone", () => {
	it("accepts IANA zones", () => {
		expect(isValidTimeZone("America/New_York")).toBe(true);
		expect(isValidTimeZone("nope")).toBe(false);
	});
});

describe("formatWorldClockTime", () => {
	it("formats a fixed instant in a zone", () => {
		const noonUtc = new Date("2026-09-04T16:00:00Z");
		const paris = formatWorldClockTime(noonUtc, "Europe/Paris");
		expect(paris).toMatch(/6:00|18:00/);
	});
});
