export type WorldClock = {
	label: string;
	timeZone: string;
};

/** Parse `Label|IANA/Timezone` lines. Invalid zones are dropped. */
export function parseWorldClocks(raw: string): WorldClock[] {
	const out: WorldClock[] = [];
	const seen = new Set<string>();
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const pipe = trimmed.indexOf("|");
		const label = (pipe >= 0 ? trimmed.slice(0, pipe) : trimmed).trim();
		const timeZone = (pipe >= 0 ? trimmed.slice(pipe + 1) : trimmed).trim();
		if (!label || !timeZone || !isValidTimeZone(timeZone)) continue;
		const key = `${label.toLowerCase()}|${timeZone}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({label, timeZone});
	}
	return out;
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", {timeZone}).format(new Date());
		return true;
	} catch {
		return false;
	}
}

export function formatWorldClockTime(now: Date, timeZone: string): string {
	try {
		return new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		}).format(now);
	} catch {
		return "";
	}
}
