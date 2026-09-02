import {describe, it, expect} from "vitest";
import * as fc from "fast-check";

/**
 * Property 3: Negative adjust increases startTime by exact offset
 *
 * **Validates: Requirements 3.2**
 *
 * For any active timer entry with a valid startTime and for any positive
 * offset N in {1, 5}, applying the −N adjustment SHALL set entry.startTime
 * to (originalStartTime + N * 60000), thereby decreasing elapsed duration
 * by exactly N minutes, provided the guard condition passes.
 */

/**
 * Pure extraction of the adjustStartTime arithmetic logic from
 * ActiveTimersPanel.adjustStartTime(). This tests the core computation
 * without DOM or plugin side-effects.
 */
import {shiftRunningTimerStart} from "../../fulcrum/utils/timerEntries";

function computeAdjustedStartTime(
	originalStartTime: number,
	offsetMinutes: number,
	now: number,
): number | null {
	return shiftRunningTimerStart(originalStartTime, offsetMinutes, now);
}

describe("Property 3: Negative adjust increases startTime by exact offset", () => {
	/**
	 * **Validates: Requirements 3.2**
	 *
	 * For negative offsets (-1 and -5), when the guard passes, the resulting
	 * startTime equals originalStartTime + abs(offset) * 60000.
	 */
	it("negative offset increases startTime by exactly N * 60000 ms when guard passes", () => {
		const now = Date.now();

		// Generator: a startTime in the past (between 1 hour ago and now - 6 minutes)
		// We ensure the startTime is far enough in the past that adding 5 * 60000
		// still won't exceed `now`, guaranteeing the guard passes.
		const pastStartTimeArb = fc.integer({
			min: now - 3_600_000, // 1 hour ago
			max: now - 6 * 60_000, // at least 6 minutes in the past
		});

		const negativeOffsetArb = fc.constantFrom(-1, -5);

		fc.assert(
			fc.property(pastStartTimeArb, negativeOffsetArb, (startTime, offset) => {
				const result = computeAdjustedStartTime(startTime, offset, now);

				// Since startTime is at least 6 minutes in the past and max offset
				// is -5 (adds 5 minutes), the guard should always pass
				expect(result).not.toBeNull();

				// Core arithmetic: for negative offset, newStartTime = startTime - (offset * 60000)
				// Since offset is negative: startTime - (negative) = startTime + abs(offset) * 60000
				const absOffset = Math.abs(offset);
				expect(result).toBe(startTime + absOffset * 60_000);
			}),
			{numRuns: 200},
		);
	});

	/**
	 * **Validates: Requirements 3.2**
	 *
	 * The adjustment correctly decreases elapsed duration by exactly N minutes.
	 */
	it("negative offset decreases elapsed duration by exactly N minutes", () => {
		const now = Date.now();

		const pastStartTimeArb = fc.integer({
			min: now - 3_600_000,
			max: now - 6 * 60_000,
		});

		const negativeOffsetArb = fc.constantFrom(-1, -5);

		fc.assert(
			fc.property(pastStartTimeArb, negativeOffsetArb, (startTime, offset) => {
				const originalElapsed = now - startTime;
				const newStartTime = computeAdjustedStartTime(startTime, offset, now);

				expect(newStartTime).not.toBeNull();

				const newElapsed = now - newStartTime!;
				const absOffset = Math.abs(offset);

				// Elapsed should decrease by exactly N minutes
				expect(originalElapsed - newElapsed).toBe(absOffset * 60_000);
			}),
			{numRuns: 200},
		);
	});

	/**
	 * **Validates: Requirements 3.2, 3.4**
	 *
	 * When the guard condition fails (new startTime would exceed Date.now()),
	 * the adjustment is rejected and returns null.
	 */
	it("rejects adjustment when new startTime would exceed now", () => {
		const now = Date.now();

		// Generate startTimes very close to now, where subtracting a negative
		// offset (adding time) would push past now
		const recentStartTimeArb = fc.integer({
			min: now - 4 * 60_000, // less than 5 minutes ago
			max: now - 1_000, // 1 second ago
		});

		fc.assert(
			fc.property(recentStartTimeArb, (startTime) => {
				// Use offset -5: adds 5 * 60000 = 300000 ms to startTime
				// If startTime is less than 5 minutes in the past, new value > now
				const result = computeAdjustedStartTime(startTime, -5, now);

				// startTime + 5 * 60000 > now when startTime > now - 5 * 60000
				// Since our range is (now - 4min) to (now - 1s), this always exceeds now
				expect(result).toBeNull();
			}),
			{numRuns: 100},
		);
	});
});
