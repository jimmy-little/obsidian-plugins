export function parseTimestamp(raw: string | null | undefined): Date | null {
	if (!raw) return null;
	const s = raw.trim();
	if (!s) return null;

	const iso = Date.parse(s);
	if (!Number.isNaN(iso)) return new Date(iso);

	const apache = s.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
	if (apache) {
		const months: Record<string, number> = {
			Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
			Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
		};
		const m = months[apache[2]];
		if (m !== undefined) {
			return new Date(
				Number(apache[3]),
				m,
				Number(apache[1]),
				Number(apache[4]),
				Number(apache[5]),
				Number(apache[6]),
			);
		}
	}

	const compactDate = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
	if (compactDate) {
		const y = Number(compactDate[1]);
		const mo = Number(compactDate[2]) - 1;
		const d = Number(compactDate[3]);
		const h = Number(compactDate[4] ?? 0);
		const mi = Number(compactDate[5] ?? 0);
		const se = Number(compactDate[6] ?? 0);
		return new Date(y, mo, d, h, mi, se);
	}

	const common = s.match(/^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/);
	if (common) {
		const months: Record<string, number> = {
			Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
			Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
		};
		const m = months[common[1]];
		if (m !== undefined) {
			const year = new Date().getFullYear();
			return new Date(year, m, Number(common[2]), Number(common[3]), Number(common[4]), Number(common[5]));
		}
	}

	return null;
}
