/**
 * Day Planner–compatible time parsing (see obsidian-day-planner src/regexp.ts + parser/time.ts).
 * Uses native minutes-from-midnight; no moment dependency.
 */

const hours12h = "[0-1]?\\d";
const hours24h = "[0-2]?\\d";
const minutes = "[0-5]\\d";
const hourMinuteSeparator = "[:.]";
const ampm = "\\s?[apAP][mM](?!\\w)";

const time12h = `(${hours12h})(?:${hourMinuteSeparator}?(${minutes}))(${ampm})`;
const time24h = `(${hours24h})(?:${hourMinuteSeparator}(${minutes}))`;
const time = `(?:${time12h}|${time24h})`;
const timeRangeSeparator = "\\s?-\\s?";
const timeRange = `(?<start>${time})(?:${timeRangeSeparator}(?<end>${time}))?`;

const timeRegExp = new RegExp(time);
const timeRangeRegExp = new RegExp(timeRange, "im");

export type ParsedTimeRange = {
	startMinutes: number;
	durationMinutes: number | null;
};

function parseSingleTime(text: string): number | null {
	const match = text.match(timeRegExp);
	if (!match) return null;

	const hours12hCap = match[1];
	const minutes12h = match[2];
	const ampmRaw = match[3];
	const hours24hCap = match[4];
	const minutes24h = match[5];

	const hoursStr = hours12hCap ?? hours24hCap;
	const minutesStr = minutes12h ?? minutes24h;
	if (hoursStr == null) return null;

	let h = parseInt(hoursStr, 10);
	if (Number.isNaN(h)) return null;

	const min = minutesStr != null ? parseInt(minutesStr, 10) : 0;
	if (Number.isNaN(min) || min < 0 || min >= 60) return null;

	const ampmNorm = ampmRaw?.toLowerCase().trim();
	if (ampmNorm === "pm") {
		if (h < 12) h += 12;
	} else if (ampmNorm === "am" && h === 12) {
		h = 0;
	} else if (!ampmNorm && h >= 24) {
		return null;
	}

	if (h >= 24) return null;
	return h * 60 + min;
}

/** Parse first time range anywhere on the line. */
export function parseTimeRangeFromLine(line: string): ParsedTimeRange | null {
	const match = line.match(timeRangeRegExp);
	if (!match?.groups?.start) return null;

	const startMinutes = parseSingleTime(match.groups.start);
	if (startMinutes == null) return null;

	const endRaw = match.groups.end;
	if (!endRaw) {
		return {startMinutes, durationMinutes: null};
	}

	const endMinutes = parseSingleTime(endRaw);
	if (endMinutes == null) {
		return {startMinutes, durationMinutes: null};
	}

	let duration = endMinutes - startMinutes;
	if (duration <= 0) {
		// End before start on same day → treat as next day (Day Planner behavior)
		duration = 24 * 60 - startMinutes + endMinutes;
	}
	return {startMinutes, durationMinutes: Math.max(1, duration)};
}

/** Remove the first matched time range from text for display titles. */
export function stripTimeRangeFromTitle(line: string): string {
	return line.replace(timeRangeRegExp, "").replace(/\s+/gu, " ").trim();
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

export function minutesToHHmm(totalMinutes: number): string {
	const h = Math.floor(totalMinutes / 60) % 24;
	const m = totalMinutes % 60;
	return `${pad2(h)}:${pad2(m)}`;
}

/** Apply inline time range to scheduled/due ISO strings (date from ⏳ or fallback day). */
export function applyTimeRangeToTaskDates(opts: {
	title: string;
	scheduledDate?: string;
	dueDate?: string;
	fallbackDateIso?: string;
}): {
	title: string;
	scheduledDate?: string;
	dueDate?: string;
	durationMinutes?: number;
} {
	const tr = parseTimeRangeFromLine(opts.title);
	let title = tr ? stripTimeRangeFromTitle(opts.title) : opts.title;
	let scheduledDate = opts.scheduledDate;
	let dueDate = opts.dueDate;
	if (!tr) {
		return {title, scheduledDate, dueDate};
	}

	const dateIso = (scheduledDate ?? opts.fallbackDateIso)?.slice(0, 10);
	if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
		return {title, scheduledDate, dueDate};
	}

	scheduledDate = `${dateIso}T${minutesToHHmm(tr.startMinutes)}`;
	if (tr.durationMinutes != null) {
		const endMin = tr.startMinutes + tr.durationMinutes;
		dueDate = `${dateIso}T${minutesToHHmm(endMin)}`;
		return {
			title,
			scheduledDate,
			dueDate,
			durationMinutes: tr.durationMinutes,
		};
	}
	return {title, scheduledDate, dueDate};
}
