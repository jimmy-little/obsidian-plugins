import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {fulcrumBridgeEnabled} from "../fulcrum/settingsDefaults";
import type {BridgeCalendarEvent} from "./types";
import type {CalendarEvent} from "../fulcrum/utils/calendarEvents";
import {createRemindersBridge} from "./remindersBridge";

function parseCalendarIds(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function bridgeCalendarEventToCalendarEvent(row: BridgeCalendarEvent): CalendarEvent {
	const start = row.startIso.slice(0, 10);
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
		kind: "external",
		dateIso: start,
		startMinutes,
		durationMinutes,
		title: row.title,
		accentCss: "var(--text-muted)",
		open: () => undefined,
	};
}

export async function fetchBridgeCalendarEvents(
	settings: FulcrumSettings,
	fromIso: string,
	toIso: string,
): Promise<CalendarEvent[]> {
	const ids = parseCalendarIds(settings.remindersCalendarIds);
	if (!fulcrumBridgeEnabled(settings) || ids.length === 0) return [];
	const bridge = await createRemindersBridge(settings);
	if (!bridge.events) return [];
	const rows = await bridge.events(fromIso, toIso, ids);
	const allowed = new Set(ids);
	return rows.filter((r) => allowed.has(r.calendarId)).map(bridgeCalendarEventToCalendarEvent);
}
