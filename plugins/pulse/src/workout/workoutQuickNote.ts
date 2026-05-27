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

function isWorkoutQuickNoteLine(line: string): boolean {
	return parseWorkoutQuickNoteText(line) != null;
}

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

function splitFrontmatter(content: string): { prefix: string; body: string } {
	const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (!match) return { prefix: "", body: content };
	return { prefix: match[0], body: content.slice(match[0].length) };
}

/** Separate quick-note lines from the rest of the note body (anywhere in the file). */
export function partitionBodyQuickNotes(body: string): { noteLines: string[]; rest: string } {
	const noteLines: string[] = [];
	const restLines: string[] = [];
	for (const line of body.split(/\r?\n/)) {
		if (isWorkoutQuickNoteLine(line)) {
			noteLines.push(line.trimEnd());
		} else {
			restLines.push(line);
		}
	}
	return {
		noteLines,
		rest: restLines.join("\n").replace(/^\s+|\s+$/g, ""),
	};
}

function rebuildWorkoutNoteContent(prefix: string, noteLines: string[], rest: string): string {
	const notes = noteLines.join("\n");
	let body = "";
	if (notes && rest) body = `${notes}\n\n${rest}\n`;
	else if (notes) body = `${notes}\n`;
	else if (rest) body = rest.endsWith("\n") ? rest : `${rest}\n`;
	return `${prefix}${body}`;
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
		const content = await vault.read(file);
		const { prefix, body } = splitFrontmatter(content);
		const { noteLines, rest } = partitionBodyQuickNotes(body);
		noteLines.push(formatWorkoutQuickNoteLine(trimmed));
		await vault.modify(file, rebuildWorkoutNoteContent(prefix, noteLines, rest));
		new Notice("Added to workout note.");
		return true;
	} catch (e) {
		console.error(e);
		new Notice("Could not write to the workout note.");
		return false;
	}
}
