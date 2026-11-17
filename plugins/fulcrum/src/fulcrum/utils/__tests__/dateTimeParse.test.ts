import {describe, expect, it} from "vitest";
import {localDateIsoFromDate, parseDateTime} from "../dateTimeParse";

function localParts(instant: Date): {dateIso: string; minutesFromMidnight: number} {
	return {
		dateIso: localDateIsoFromDate(instant),
		minutesFromMidnight: instant.getHours() * 60 + instant.getMinutes(),
	};
}

describe("parseDateTime", () => {
	it("keeps a zone-less datetime as written wall time", () => {
		expect(parseDateTime("2026-11-10T09:30:00")).toEqual({
			dateIso: "2026-11-10",
			minutesFromMidnight: 9 * 60 + 30,
		});
		expect(parseDateTime("2026-03-30 09:30")).toEqual({
			dateIso: "2026-03-30",
			minutesFromMidnight: 9 * 60 + 30,
		});
		expect(parseDateTime("2026-11-10")).toEqual({
			dateIso: "2026-11-10",
			minutesFromMidnight: null,
		});
	});

	it("converts Jira's +0000 timestamp to the local clock", () => {
		const raw = "2026-11-10T12:14:23.456+0000";
		const parsed = parseDateTime(raw);
		expect(parsed).toEqual(localParts(new Date("2026-11-10T12:14:23.456Z")));
		if (new Date().getTimezoneOffset() !== 0) {
			expect(parsed?.minutesFromMidnight).not.toBe(12 * 60 + 14);
		}
	});

	it("treats Z and ±HH:mm the same as ±HHmm", () => {
		const expected = localParts(new Date("2026-11-10T14:59:00.000Z"));
		expect(parseDateTime("2026-11-10T14:59:00.000Z")).toEqual(expected);
		expect(parseDateTime("2026-11-10T14:59:00.000+00:00")).toEqual(expected);
		expect(parseDateTime("2026-11-10T06:59:00.000-0800")).toEqual(expected);
	});

	it("does not keep the clock digits when a zone is present but the time is invalid", () => {
		expect(parseDateTime("2026-11-10T25:14:00Z")).toBeNull();
	});

	it("moves a UTC timestamp onto the previous local date when the offset crosses midnight", () => {
		const raw = "2026-11-10T02:00:00.000Z";
		const parsed = parseDateTime(raw);
		expect(parsed).toEqual(localParts(new Date(raw)));
	});
});
