/** Default GitHub-like buckets: level 1–4 need at least 1, 2, 4, 7 occurrences. */
export const DEFAULT_LEVEL_THRESHOLDS: readonly [number, number, number, number] = [1, 2, 4, 7];

/** Map a count to 0–4 intensity levels (0 = none / out of range handled separately). */
export function countToLevel(count: number, thresholds: readonly number[] = DEFAULT_LEVEL_THRESHOLDS): 0 | 1 | 2 | 3 | 4 {
	if (count <= 0) return 0;
	let level: 0 | 1 | 2 | 3 | 4 = 0;
	for (let i = 0; i < thresholds.length; i++) {
		if (count >= thresholds[i]) level = (i + 1) as 1 | 2 | 3 | 4;
	}
	return level;
}

/**
 * Scale thresholds from the max count in the dataset (GitHub-style relative intensity).
 * Produces four ascending thresholds so `countToLevel` maps 1…max into four bands.
 */
export function relativeThresholds(maxCount: number): number[] {
	if (maxCount <= 0) return [...DEFAULT_LEVEL_THRESHOLDS];
	if (maxCount <= 4) return [1, 2, 3, 4];
	return [
		Math.max(1, Math.ceil(maxCount * 0.25)),
		Math.max(1, Math.ceil(maxCount * 0.5)),
		Math.max(1, Math.ceil(maxCount * 0.75)),
		maxCount,
	];
}
