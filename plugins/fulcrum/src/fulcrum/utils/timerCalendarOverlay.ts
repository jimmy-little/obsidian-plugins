import type {TimerModule} from "../../timer/TimerModule";
import type {CalendarEvent} from "./calendarEvents";

function localDateIso(d: Date): string {
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

function minutesFromMs(ms: number): number {
	const d = new Date(ms);
	return d.getHours() * 60 + d.getMinutes();
}

export async function buildTimerCalendarOverlay(
	timer: TimerModule,
	startDate: Date,
	endDate: Date,
	opts: {showLogged: boolean; showPlanned: boolean},
	openNote: (path: string) => void,
): Promise<CalendarEvent[]> {
	const out: CalendarEvent[] = [];
	const rangeStart = new Date(startDate);
	rangeStart.setHours(0, 0, 0, 0);
	const rangeEnd = new Date(endDate);
	rangeEnd.setHours(23, 59, 59, 999);

	if (opts.showLogged) {
		const groups = await timer.getTrackedNotesWithEntries();
		for (const {file, entries} of groups) {
			for (const entry of entries) {
				if (entry.startTime == null) continue;
				const endMs = entry.endTime ?? Date.now();
				if (endMs < rangeStart.getTime() || entry.startTime > rangeEnd.getTime()) continue;
				const startD = new Date(entry.startTime);
				const isActive = entry.endTime == null;
				out.push({
					kind: "logged",
					dateIso: localDateIso(startD),
					startMinutes: minutesFromMs(entry.startTime),
					durationMinutes: Math.max(1, Math.round((endMs - entry.startTime) / 60000)),
					title: entry.label || file.basename,
					accentCss: "var(--color-green)",
					open: () => openNote(file.path),
					timerEntryId: entry.id,
					timerNotePath: file.path,
					timerStartMs: entry.startTime,
					isActiveTimer: isActive,
				});
			}
		}
	}

	if (opts.showPlanned) {
		const planned = await timer.getAllPlannedInRange(rangeStart, rangeEnd);
		for (const row of planned) {
			const b = row.block;
			out.push({
				kind: "planned",
				dateIso: row.dateIso,
				startMinutes: minutesFromMs(b.startTime),
				durationMinutes: Math.max(1, Math.round((b.endTime - b.startTime) / 60000)),
				title: b.label,
				accentCss: "var(--color-orange)",
				open: () => openNote(row.file.path),
				planned: {file: row.file, block: b, dateIso: row.dateIso},
			});
		}
	}

	return out;
}
