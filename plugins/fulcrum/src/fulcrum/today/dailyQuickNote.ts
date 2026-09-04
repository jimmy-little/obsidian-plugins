import type {App, TFile} from "obsidian";
import {
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
} from "obsidian-daily-notes-interface";
import moment from "moment";
import {formatDailyQuickNoteLine} from "./dailyQuickNoteFormat";

export {formatDailyQuickNoteLine} from "./dailyQuickNoteFormat";

export function momentForIso(dateIso: string): moment.Moment | null {
	const day = moment(dateIso.slice(0, 10), "YYYY-MM-DD", true);
	return day.isValid() ? day : null;
}

export function getDailyNoteForIso(dateIso: string): TFile | null {
	const day = momentForIso(dateIso);
	if (!day) return null;
	try {
		return getDailyNote(day, getAllDailyNotes()) ?? null;
	} catch {
		return null;
	}
}

export async function ensureDailyNoteForIso(app: App, dateIso: string): Promise<TFile | null> {
	const existing = getDailyNoteForIso(dateIso);
	if (existing) return existing;
	const day = momentForIso(dateIso);
	if (!day) return null;
	try {
		const created = await createDailyNote(day);
		return created ?? null;
	} catch {
		return null;
	}
}

export async function appendQuickNoteToDailyNote(
	app: App,
	dateIso: string,
	text: string,
	now = new Date(),
): Promise<TFile | null> {
	const body = text.replace(/\s+/g, " ").trim();
	if (!body) return null;
	const file = await ensureDailyNoteForIso(app, dateIso);
	if (!file) return null;
	const line = formatDailyQuickNoteLine(body, now);
	const current = await app.vault.read(file);
	const next = `${current.trimEnd()}\n\n${line}\n`;
	await app.vault.modify(file, next);
	return file;
}
