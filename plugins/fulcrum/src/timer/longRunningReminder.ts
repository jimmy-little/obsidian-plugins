export function longRunningReminderKey(filePath: string, startTime: number): string {
	return `${filePath}:${Math.floor(startTime / 1000)}`;
}

/** 1-based interval count that elapsed time has reached, or null before the first. */
export function longRunningReminderBucket(
	elapsedMs: number,
	intervalMinutes: number,
): number | null {
	if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
	if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;
	const intervalMs = intervalMinutes * 60_000;
	const bucket = Math.floor(elapsedMs / intervalMs);
	return bucket >= 1 ? bucket : null;
}

/**
 * Next bucket to announce, or null when elapsed is still under one interval
 * or this bucket was already notified.
 */
export function shouldNotifyLongRunning(
	lastNotifiedBucket: number | undefined,
	elapsedMs: number,
	intervalMinutes: number,
): number | null {
	const bucket = longRunningReminderBucket(elapsedMs, intervalMinutes);
	if (bucket == null) return null;
	if (lastNotifiedBucket != null && lastNotifiedBucket >= bucket) return null;
	return bucket;
}

export function formatLongRunningNotice(opts: {
	label: string;
	project: string | null;
	elapsed: string;
}): string {
	const name = opts.label.trim();
	const project = opts.project?.trim() || "";
	if (name && project) {
		return `Timer still running: ${name} — ${project} (${opts.elapsed})`;
	}
	if (name) return `Timer still running: ${name} (${opts.elapsed})`;
	if (project) return `Timer still running: ${project} (${opts.elapsed})`;
	return `Timer still running (${opts.elapsed})`;
}
