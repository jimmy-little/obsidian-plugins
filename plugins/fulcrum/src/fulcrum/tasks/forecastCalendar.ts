import type {FulcrumSettings} from "../settingsDefaults";
import type {BridgeCalendarEvent} from "../../conduit/types";
import type {ForecastCalendarRow} from "./tasksViewModel";
import {createRemindersBridge} from "../../conduit/remindersBridge";

export function parseForecastCalendarIds(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function bridgeEventToForecastRow(
	row: BridgeCalendarEvent,
	calendarTitle?: string,
): ForecastCalendarRow {
	const dateIso = row.startIso.slice(0, 10);
	const startMinutes = row.allDay
		? null
		: (() => {
				const d = new Date(row.startIso);
				if (Number.isNaN(d.getTime())) return null;
				return d.getHours() * 60 + d.getMinutes();
			})();
	let durationMinutes: number | null = null;
	if (!row.allDay && row.endIso) {
		const a = new Date(row.startIso).getTime();
		const b = new Date(row.endIso).getTime();
		if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
			durationMinutes = Math.max(15, Math.round((b - a) / 60_000));
		}
	}
	return {
		eventId: row.id,
		title: row.title,
		dateIso,
		startMinutes,
		durationMinutes,
		calendarTitle,
	};
}

export async function fetchForecastCalendarRows(
	settings: FulcrumSettings,
	fromIso: string,
	toIso: string,
): Promise<ForecastCalendarRow[]> {
	const ids = parseForecastCalendarIds(settings.forecastCalendarIds);
	if (!settings.conduitEnabled || !settings.forecastShowSystemCalendars || ids.length === 0) {
		return [];
	}
	const bridge = await createRemindersBridge(settings);
	if (!bridge.events) return [];
	const titleById = new Map<string, string>();
	if (bridge.calendars) {
		try {
			const cals = await bridge.calendars();
			for (const c of cals) titleById.set(c.id, c.title);
		} catch {
			/* optional */
		}
	}
	const rows = await bridge.events(fromIso, toIso, ids);
	const allowed = new Set(ids);
	return rows
		.filter((r) => allowed.has(r.calendarId))
		.map((r) => bridgeEventToForecastRow(r, titleById.get(r.calendarId)));
}
