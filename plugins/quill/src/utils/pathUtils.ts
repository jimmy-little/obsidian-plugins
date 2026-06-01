import type { UserEntryType } from "../settings";
import type { EntryTypeRuleShape } from "../journal";

export function entryTypesToRuleShape(list: UserEntryType[] | undefined): EntryTypeRuleShape[] {
	if (!list?.length) return [];
	return list.map((t) => ({ name: t.name, mode: t.mode, value: t.value }));
}

/** Format a path template with moment-style date variables. */
export function formatPathWithDate(template: string, date: Date): string {
	const YYYY = date.getFullYear();
	const M = date.getMonth() + 1;
	const D = date.getDate();
	const H = date.getHours();
	const m = date.getMinutes();
	const s = date.getSeconds();
	const monthNames = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December",
	];
	const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	const dayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return template
		.replace(/\{YYYY\}/g, String(YYYY))
		.replace(/\{MM\}/g, String(M).padStart(2, "0"))
		.replace(/\{M\}/g, String(M))
		.replace(/\{DD\}/g, String(D).padStart(2, "0"))
		.replace(/\{D\}/g, String(D))
		.replace(/\{HH\}/g, String(H).padStart(2, "0"))
		.replace(/\{mm\}/g, String(m).padStart(2, "0"))
		.replace(/\{ss\}/g, String(s).padStart(2, "0"))
		.replace(/\{MMMM\}/g, monthNames[date.getMonth()])
		.replace(/\{MMM\}/g, monthShort[date.getMonth()])
		.replace(/\{dddd\}/g, dayNames[date.getDay()])
		.replace(/\{ddd\}/g, dayShort[date.getDay()]);
}

/** Sanitize a string for use as a filename: strip illegal chars, trim, max 256 chars. */
export function sanitizeFilename(thought: string): string {
	const illegal = /[\\/:*?"<>|\x00-\x1f]/g;
	const trimmed = thought.trim().replace(illegal, "").replace(/\s+/g, " ") || "entry";
	return trimmed.slice(0, 256);
}

/** Return file extension for image file name, or .png as fallback. */
export function getImageExtension(fileName: string): string {
	const match = fileName.match(/\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i);
	return match ? "." + match[1]!.toLowerCase() : ".png";
}

/** Parse tags string (e.g. "#a #b" or "a, b") into array of tag strings without #. */
export function parseTagsInput(raw: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const part of raw.split(/[\s,#]+/)) {
		const t = part.replace(/^#+/, "").trim();
		if (t && !seen.has(t)) {
			seen.add(t);
			out.push(t);
		}
	}
	return out;
}
