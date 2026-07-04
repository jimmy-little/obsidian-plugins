/** Parse leading date/datetime from note basename (before falling back to mtime). */

export type FilenameWhen = { ms: number; hasTime: boolean };

/**
 * Try ISO-ish prefixes: full ISO with colons, `YYYY-MM-DDTHHMM`, `YYYYMMDD-HHMM`,
 * datetime with space, date-only, then `YYYYMMDD` at start.
 */
export function tryParseWhenFromBasename(basename: string): FilenameWhen | null {
	const s = basename.replace(/\.md$/i, "").trim();
	if (!s) return null;

	// 1) Full ISO at start: 2024-01-07T18:30:00, optional Z / offset
	const isoFull = s.match(
		/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})?)(?=[-_\s]|$)/i,
	);
	if (isoFull) {
		const ms = Date.parse(isoFull[1]);
		if (!Number.isNaN(ms)) return {ms, hasTime: true};
	}

	// 2) Compact: 2020-06-09T1100- title (no colon after T)
	const compact = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(?=[-_\s.]|$)/);
	if (compact) {
		const ms = Date.parse(`${compact[1]}T${compact[2]}:${compact[3]}:00`);
		if (!Number.isNaN(ms)) return {ms, hasTime: true};
	}

	// 3) Compact date + T + HHMM without dashes in date: 20200609T1200
	const compact2 = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?=[-_\s.]|$)/);
	if (compact2) {
		const iso = `${compact2[1]}-${compact2[2]}-${compact2[3]}T${compact2[4]}:${compact2[5]}:00`;
		const ms = Date.parse(iso);
		if (!Number.isNaN(ms)) return {ms, hasTime: true};
	}

	// 4) YYYYMMDD-HHMM or -HHMMSS
	const ymdHms = s.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})?(?=[-_\s]|$)/);
	if (ymdHms) {
		const sec = ymdHms[6] ? `:${ymdHms[6]}` : ":00";
		const iso = `${ymdHms[1]}-${ymdHms[2]}-${ymdHms[3]}T${ymdHms[4]}:${ymdHms[5]}${sec}`;
		const ms = Date.parse(iso);
		if (!Number.isNaN(ms)) return {ms, hasTime: true};
	}

	// 5) YYYY-MM-DD HH:MM
	const dtSpace = s.match(/^(\d{4}-\d{2}-\d{2})[ _](\d{2}:\d{2}(?::\d{2})?)(?=[-_\s]|$)/);
	if (dtSpace) {
		const ms = Date.parse(`${dtSpace[1]}T${dtSpace[2]}`);
		if (!Number.isNaN(ms)) return {ms, hasTime: true};
	}

	// 6) Date only YYYY-MM-DD
	const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})(?=[-_\sT]|$)/);
	if (dateOnly) {
		const ms = Date.parse(`${dateOnly[1]}T12:00:00`);
		if (!Number.isNaN(ms)) return {ms, hasTime: false};
	}

	// 7) YYYYMMDD only
	const ymdOnly = s.match(/^(\d{4})(\d{2})(\d{2})(?=[-_\s]|$)/);
	if (ymdOnly) {
		const iso = `${ymdOnly[1]}-${ymdOnly[2]}-${ymdOnly[3]}T12:00:00`;
		const ms = Date.parse(iso);
		if (!Number.isNaN(ms)) return {ms, hasTime: false};
	}

	return null;
}
