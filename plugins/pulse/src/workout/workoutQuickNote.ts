import { Notice, TFile, Vault } from "obsidian";

/** Matches suite quick-note bullets (Orbit / Fulcrum style). */
export function formatWorkoutQuickNoteLine(text: string): string {
	const d = new Date();
	const mo = d.getMonth() + 1;
	const da = d.getDate();
	const y = String(d.getFullYear()).slice(-2);
	let h = d.getHours();
	const mins = d.getMinutes();
	const ampm = h >= 12 ? "PM" : "AM";
	const h12 = h % 12 || 12;
	const mm = String(mins).padStart(2, "0");
	const time = `${h12}:${mm} ${ampm}`;
	return `- ${mo}/${da}/${y}, ${time} — ${text}`;
}

const QUICK_NOTE_LINE =
	/^[-*]\s+\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s+—\s+(.+)$/i;

/** Extract quick-note text from a bullet line; returns null if not a quick note. */
export function parseWorkoutQuickNoteText(line: string): string | null {
	const trimmed = line.trim();
	const m = trimmed.match(QUICK_NOTE_LINE);
	if (m?.[1]) return m[1].trim();
	return null;
}

/** All quick-note bullets in a workout note body (after frontmatter). */
export function parseWorkoutQuickNotesFromBody(body: string): string[] {
	const notes: string[] = [];
	for (const line of body.split(/\r?\n/)) {
		const text = parseWorkoutQuickNoteText(line);
		if (text) notes.push(text);
	}
	return notes;
}

export async function appendWorkoutQuickNote(
	vault: Vault,
	file: TFile,
	text: string,
): Promise<boolean> {
	const trimmed = text.trim();
	if (!trimmed) {
		new Notice("Write something to add to the workout note.");
		return false;
	}
	try {
		const line = formatWorkoutQuickNoteLine(trimmed);
		await vault.append(file, `\n${line}\n`);
		new Notice("Added to workout note.");
		return true;
	} catch (e) {
		console.error(e);
		new Notice("Could not write to the workout note.");
		return false;
	}
}
