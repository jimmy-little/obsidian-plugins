import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	requestUrl: vi.fn(),
	Setting: class Setting {},
}));

import type {BridgeCalendarEvent} from "../../../conduit/types";
import type {FulcrumSettings} from "../../settingsDefaults";
import {
	bridgeEventToForecastRow,
	padBridgeCalendarQuery,
	parseForecastCalendarIds,
	selectedBridgeCalendarIds,
} from "../forecastCalendar";

describe("selectedBridgeCalendarIds", () => {
	it("unions Horizon and Calendar overlay selections", () => {
		const settings = {
			forecastCalendarIds: "work,home",
			remindersCalendarIds: "home,family",
		} as FulcrumSettings;
		expect(selectedBridgeCalendarIds(settings).sort()).toEqual(["family", "home", "work"]);
	});

	it("parses empty lists", () => {
		expect(parseForecastCalendarIds("")).toEqual([]);
		expect(parseForecastCalendarIds("  a , b ")).toEqual(["a", "b"]);
	});
});

describe("padBridgeCalendarQuery", () => {
	it("widens the range by a day on each side", () => {
		expect(padBridgeCalendarQuery("2026-09-04", "2026-09-18")).toEqual({
			queryFrom: "2026-09-03",
			queryTo: "2026-09-20",
		});
	});
});

describe("bridgeEventToForecastRow", () => {
	it("keeps location and local start time", () => {
		const row: BridgeCalendarEvent = {
			id: "evt-1",
			calendarId: "cal-1",
			title: "Standup",
			startIso: "2026-09-04T08:35:00",
			endIso: "2026-09-04T09:05:00",
			allDay: false,
			location: "Fluree Maintenance and Updates",
		};
		const mapped = bridgeEventToForecastRow(row, "Work");
		expect(mapped.location).toBe("Fluree Maintenance and Updates");
		expect(mapped.calendarTitle).toBe("Work");
		expect(mapped.startMinutes).toBe(8 * 60 + 35);
		expect(mapped.durationMinutes).toBe(30);
		expect(mapped.dateIso).toBe("2026-09-04");
	});

	it("treats all-day events as untimed on the local date", () => {
		const mapped = bridgeEventToForecastRow({
			id: "evt-2",
			calendarId: "cal-1",
			title: "Holiday",
			startIso: "2026-09-04T00:00:00",
			endIso: "2026-09-05T00:00:00",
			allDay: true,
			location: "Paris",
		});
		expect(mapped.startMinutes).toBeNull();
		expect(mapped.location).toBe("Paris");
		expect(mapped.dateIso).toBe("2026-09-04");
	});
});
