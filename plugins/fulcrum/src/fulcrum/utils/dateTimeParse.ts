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

/**
 * Absolute timestamp: `YYYY-MM-DD[T ]HH:mm[:ss[.frac]]` plus `Z` or `±HH:mm` / `±HHmm`.
 * Jira sends the no-colon form (`2026-11-10T12:14:23.456+0000`).
 */
const ZONED_ISO =
	/^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|([+-])(\d{2}):?(\d{2}))$/;

function inRange(n: number, min: number, max: number): boolean {
	return Number.isInteger(n) && n >= min && n <= max;
}

/** Zone designator present → the real local clock, not the digits in the string. */
function parseZonedDateTime(s: string): {dateIso: string; minutesFromMidnight: number} | null {
	const m = ZONED_ISO.exec(s);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	const hour = Number(m[4]);
	const minute = Number(m[5]);
	const second = m[6] != null ? Number(m[6]) : 0;
	const frac = m[7] ?? "";
	const millis = frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0;
	if (
		!inRange(month, 1, 12) ||
		!inRange(day, 1, 31) ||
		!inRange(hour, 0, 23) ||
		!inRange(minute, 0, 59) ||
		!inRange(second, 0, 59) ||
		!inRange(millis, 0, 999)
	) {
		return null;
	}
	let offsetMinutes = 0;
	if (m[8]) {
		const sign = m[8] === "-" ? -1 : 1;
		offsetMinutes = sign * (Number(m[9]) * 60 + Number(m[10]));
	}
	const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMinutes * 60_000;
	const d = new Date(utcMs);
	if (Number.isNaN(d.getTime())) return null;
	return {
		dateIso: localDateIso(d),
		minutesFromMidnight: d.getHours() * 60 + d.getMinutes(),
	};
}

/**
 * Parse an ISO-like string to { dateIso, minutesFromMidnight } in local time.
 *
 * A trailing zone (`Z`, `+0000`, `-08:00`) is an absolute instant and is converted to the
 * local clock. Strings without a zone (`2026-03-30T09:30`, `2026-03-30 09:30`) are wall times
 * and are kept as written — vault notes and tasks store local time with no offset.
 */
export function parseDateTime(raw: string | undefined): {
	dateIso: string;
	minutesFromMidnight: number | null;
} | null {
	if (!raw?.trim()) return null;
	const s = String(raw).trim();
	// A zone is an absolute instant. Never fall through to the wall-clock path, which
	// would keep the UTC digits and place the row hours ahead.
	if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return parseZonedDateTime(s);
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
