/** Sorted unique note paths for the running-timer rows a panel is showing. */
export function activeTimerDisplayKeys(rows: Array<{filePath: string}>): string[] {
	const keys = new Set<string>();
	for (const row of rows) {
		if (row.filePath) keys.add(row.filePath);
	}
	return [...keys].sort();
}

export function activeTimerDisplayKey(rows: Array<{filePath: string}>): string {
	return activeTimerDisplayKeys(rows).join("\0");
}

/** True when the on-screen row set no longer matches the filtered live set. */
export function activeTimerSetChanged(
	displayed: Iterable<string>,
	next: Iterable<string>,
): boolean {
	const shown = new Set(displayed);
	const live = new Set(next);
	if (shown.size !== live.size) return true;
	for (const key of shown) {
		if (!live.has(key)) return true;
	}
	return false;
}
