/** Local calendar date + minutes from midnight → `YYYY-MM-DDTHH:mm:ss` (no timezone offset). */
export function formatLocalIsoDateTime(dateIso: string, startMinutes: number): string {
	const h = Math.floor(startMinutes / 60) % 24;
	const m = startMinutes % 60;
	const date = dateIso.slice(0, 10);
	return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Local date + optional minutes → ISO date or datetime string for frontmatter. */
export function formatSlotValue(dateIso: string, startMinutes: number | null): string {
	if (startMinutes == null) return dateIso.slice(0, 10);
	return formatLocalIsoDateTime(dateIso, startMinutes);
}

/**
 * Normalize date/datetime strings for frontmatter and inline markers.
 * Converts `2025-12-10 20:02` → `2025-12-10T20:02:00`.
 */
export function normalizeIsoDateTime(value: string | null | undefined): string | null {
	if (value == null) return null;
	const s = String(value).trim();
	if (!s) return null;
	if (/^\d{4}-\d{2}-\d{2}$/u.test(s)) return s;

	const spaced = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/u);
	if (spaced) {
		const sec = spaced[4] ?? "00";
		return `${spaced[1]}T${String(Number.parseInt(spaced[2]!, 10)).padStart(2, "0")}:${spaced[3]}:${sec}`;
	}

	const iso = s.match(/^(\d{4}-\d{2}-\d{2})[Tt](\d{1,2}):(\d{2})(?::(\d{2}))?/u);
	if (iso) {
		const sec = iso[4] ?? "00";
		return `${iso[1]}T${String(Number.parseInt(iso[2]!, 10)).padStart(2, "0")}:${iso[3]}:${sec}`;
	}

	return s;
}

export function localTimestampFromSlot(dateIso: string, startMinutes: number): number {
	const [y, mo, d] = dateIso.slice(0, 10).split("-").map((x) => Number.parseInt(x, 10));
	const h = Math.floor(startMinutes / 60);
	const m = startMinutes % 60;
	return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

/** True when value includes a time component (not date-only). */
export function hasTimeComponent(value: string): boolean {
	const n = normalizeIsoDateTime(value);
	if (!n) return false;
	return n.includes("T");
}
