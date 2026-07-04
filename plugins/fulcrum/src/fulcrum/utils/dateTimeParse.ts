function localDateIso(d: Date): string {
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

/**
 * After a YYYY-MM-DD prefix, parse HH:mm (optional :ss). Accepts `T`, `t`, or whitespace
 * between date and time (e.g. `2026-03-30 09:30`).
 */
function parseMinutesAfterIsoDate(rest: string): number | null {
	const tail = rest.trimStart();
	const m = tail.match(/^(?:[Tt]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
	if (!m) return null;
	const h = parseInt(m[1]!, 10);
	const min = parseInt(m[2]!, 10);
	if (h >= 0 && h < 24 && min >= 0 && min < 60) {
		return h * 60 + min;
	}
	return null;
}

/** Parse ISO-like string to { dateIso, minutesFromMidnight }. */
export function parseDateTime(raw: string | undefined): {
	dateIso: string;
	minutesFromMidnight: number | null;
} | null {
	if (!raw?.trim()) return null;
	const s = String(raw).trim();
	const datePart = s.slice(0, 10);
	if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
		const rest = s.slice(10);
		const minutesFromMidnight =
			rest.length > 0 ? parseMinutesAfterIsoDate(rest) : null;
		return {dateIso: datePart, minutesFromMidnight};
	}

	const ms = Date.parse(s);
	if (Number.isNaN(ms)) return null;
	const d = new Date(ms);
	const dateIso = localDateIso(d);
	const minutesFromMidnight = d.getHours() * 60 + d.getMinutes();
	const hasTime =
		d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0;
	return {
		dateIso,
		minutesFromMidnight: hasTime ? minutesFromMidnight : null,
	};
}

export function localDateIsoFromDate(d: Date): string {
	return localDateIso(d);
}
