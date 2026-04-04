/**
 * Single event in the append-only log.
 * Timestamps stored as ISO strings; period logic uses local time.
 */
export interface RatchetEvent {
	id: string;
	timestamp: string; // ISO 8601
	tracker: string;
	value: number;
	note: string;
}

export function parseEventLine(line: string): RatchetEvent | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const o = JSON.parse(trimmed) as unknown;
		if (
			o &&
			typeof o === "object" &&
			typeof (o as RatchetEvent).tracker === "string" &&
			typeof (o as RatchetEvent).value === "number"
		) {
			const e = o as RatchetEvent;
			return {
				id: typeof e.id === "string" ? e.id : "",
				timestamp: typeof e.timestamp === "string" ? e.timestamp : "",
				tracker: e.tracker,
				value: e.value,
				note: typeof e.note === "string" ? e.note : "",
			};
		}
	} catch {
		// skip malformed lines
	}
	return null;
}

export function eventToLine(e: RatchetEvent): string {
	return JSON.stringify(e) + "\n";
}
