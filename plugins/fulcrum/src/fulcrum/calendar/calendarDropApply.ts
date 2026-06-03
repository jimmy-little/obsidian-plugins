import type {App} from "obsidian";
import {Notice} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import type {FulcrumHost} from "../pluginBridge";
import type {IndexedMeeting, IndexedTask} from "../types";
import type {CalendarEvent, CalendarEventKind} from "../utils/calendarEvents";
import {
	applyTaskScheduleOnSlot,
	type TaskScheduleDateField,
} from "../kanban/taskFieldUpdate";
import type {CalendarDropSlot} from "./calendarDropSlot";
import {slotStartMinutes} from "./calendarDropSlot";
import {formatLocalIsoDateTime, localTimestampFromSlot} from "./isoDateTime";

export type {CalendarDropSlot} from "./calendarDropSlot";
export {parseDropSlotFromElement, slotStartMinutes} from "./calendarDropSlot";

export const FULCRUM_CALENDAR_EVENT_MIME = "application/x-fulcrum-calendar-event+json";

export type CalendarEventDragPayload = {
	kind: CalendarEventKind;
	task?: {path: string; line: number | null; source: string};
	meetingPath?: string;
	timerNotePath?: string;
	timerEntryId?: string;
	planned?: {fromDateIso: string; blockId: string; filePath: string};
};

export function calendarEventDragPayload(e: CalendarEvent): string {
	const payload: CalendarEventDragPayload = {kind: e.kind};
	if (e.task) {
		payload.task = {
			path: e.task.file.path,
			line: e.task.line ?? null,
			source: e.task.source,
		};
	}
	if (e.meeting) payload.meetingPath = e.meeting.file.path;
	if (e.timerNotePath && e.timerEntryId) {
		payload.timerNotePath = e.timerNotePath;
		payload.timerEntryId = e.timerEntryId;
	}
	if (e.planned) {
		payload.planned = {
			fromDateIso: e.planned.dateIso,
			blockId: e.planned.block.id,
			filePath: e.planned.file.path,
		};
	}
	return JSON.stringify(payload);
}

export function findCalendarEventByPayload(
	events: CalendarEvent[],
	raw: string,
): CalendarEvent | undefined {
	try {
		const p = JSON.parse(raw) as CalendarEventDragPayload;
		return events.find((e) => {
			if (e.kind !== p.kind) return false;
			if (p.task && e.task) {
				return (
					e.task.file.path === p.task.path &&
					(e.task.line ?? null) === (p.task.line ?? null) &&
					e.task.source === p.task.source
				);
			}
			if (p.meetingPath && e.meeting) {
				return e.meeting.file.path === p.meetingPath;
			}
			if (p.timerEntryId && p.timerNotePath) {
				return (
					e.timerEntryId === p.timerEntryId && e.timerNotePath === p.timerNotePath
				);
			}
			if (p.planned && e.planned) {
				return (
					e.planned.block.id === p.planned.blockId &&
					e.planned.dateIso === p.planned.fromDateIso
				);
			}
			return false;
		});
	} catch {
		return undefined;
	}
}

async function rescheduleLoggedEntry(
	host: FulcrumHost,
	filePath: string,
	entryId: string,
	slot: CalendarDropSlot,
): Promise<void> {
	const startMinutes = slotStartMinutes(slot);
	if (startMinutes == null) {
		new Notice("Drop on a time slot to reschedule logged time.");
		return;
	}
	const newStart = localTimestampFromSlot(slot.dateIso, startMinutes);
	await host.timer.rescheduleLoggedEntry(filePath, entryId, newStart);
}

async function reschedulePlannedBlock(
	host: FulcrumHost,
	planned: {fromDateIso: string; blockId: string; filePath: string},
	slot: CalendarDropSlot,
): Promise<void> {
	const startMinutes = slotStartMinutes(slot);
	if (startMinutes == null) {
		new Notice("Drop on a time slot to reschedule planned time.");
		return;
	}
	const blocks = await host.timer.loadPlannedBlocksForDay(planned.fromDateIso);
	const block = blocks.find((b) => b.id === planned.blockId);
	if (!block) throw new Error("Planned block not found");
	const newStart = localTimestampFromSlot(slot.dateIso, startMinutes);
	const duration = Math.max(15 * 60 * 1000, block.endTime - block.startTime);
	const newEnd = newStart + duration;
	await host.timer.movePlannedBlock(
		planned.fromDateIso,
		block,
		newStart,
		newEnd,
		slot.dateIso,
	);
}

export async function applyMeetingScheduleOnSlot(
	app: App,
	meeting: IndexedMeeting,
	settings: FulcrumSettings,
	slot: CalendarDropSlot,
): Promise<void> {
	const startMinutes = slotStartMinutes(slot);
	const value =
		startMinutes != null
			? formatLocalIsoDateTime(slot.dateIso, startMinutes)
			: slot.dateIso.slice(0, 10);
	const startKey = settings.meetingStartTimeField?.trim();
	const dateKey = settings.meetingDateField?.trim();
	await app.fileManager.processFrontMatter(meeting.file, (fm) => {
		if (startKey && startMinutes != null) {
			fm[startKey] = value;
			if (dateKey && dateKey !== startKey) {
				fm[dateKey] = slot.dateIso.slice(0, 10);
			}
		} else if (dateKey) {
			fm[dateKey] = value;
		} else if (startKey) {
			fm[startKey] = value;
		}
	});
}

export async function applyCalendarEventToSlot(
	host: FulcrumHost,
	event: CalendarEvent,
	slot: CalendarDropSlot,
	taskScheduleField?: TaskScheduleDateField,
): Promise<void> {
	switch (event.kind) {
		case "task": {
			if (!event.task) return;
			const field = taskScheduleField ?? "scheduled";
			await applyTaskScheduleOnSlot(
				host.app,
				event.task,
				host.settings,
				slot,
				field,
			);
			return;
		}
		case "meeting": {
			if (!event.meeting) return;
			await applyMeetingScheduleOnSlot(
				host.app,
				event.meeting,
				host.settings,
				slot,
			);
			return;
		}
		case "logged": {
			if (!event.timerNotePath || !event.timerEntryId) return;
			await rescheduleLoggedEntry(
				host,
				event.timerNotePath,
				event.timerEntryId,
				slot,
			);
			return;
		}
		case "planned": {
			if (!event.planned) return;
			await reschedulePlannedBlock(host, {
				fromDateIso: event.planned.dateIso,
				blockId: event.planned.block.id,
				filePath: event.planned.file.path,
			}, slot);
			return;
		}
		default:
			return;
	}
}
