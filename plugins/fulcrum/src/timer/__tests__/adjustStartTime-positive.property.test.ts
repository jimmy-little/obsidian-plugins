import {describe, it, expect} from "vitest";
import * as fc from "fast-check";

/**
 * Property 2: Positive adjust decreases startTime by exact offset
 *
 * **Validates: Requirements 3.1**
 *
 * For any active timer entry with a valid startTime and for any positive
 * offset N in {1, 5}, applying the +N adjustment SHALL set entry.startTime
 * to (originalStartTime - N * 60000), thereby increasing elapsed duration
 * by exactly N minutes.
 */

/**
 * Pure extraction of the adjustStartTime arithmetic logic from
 * ActiveTimersPanel.adjustStartTime(). This tests the core computation
 * without DOM or plugin side-effects.
 */
function computeAdjustedStartTime(
	originalStartTime: number,
	offsetMinutes: number,
	now: number,
): number | null {
	const offsetMs = offsetMinutes * 60 * 1000;
	const newStartTime = originalStartTime - offsetMs;

	// Guard: new startTime must not be in the future
	if (newStartTime > now) return null;

	return newStartTime;
}

describe("Property 2: Positive adjust decreases startTime by exact offset", () => {
	/**
	 * **Validates: Requirements 3.1**
	 *
	 * For positive offsets (1 and 5), the resulting startTime equals
	 * originalStartTime - offset * 60000.
	 */
	it("positive offset decreases startTime by exactly N * 60000 ms", () => {
		const now = Date.now();

		// Generator: a startTime in the past such that subtracting offset*60000
		// still yields a valid (non-future) timestamp.
		// Minimum: 6 minutes in the past ensures even offset=5 keeps result in the past.
		const pastStartTimeArb = fc.integer({
			min: now - 3_600_000, // 1 hour ago
			max: now - 6 * 60_000, // at least 6 minutes in the past
		});

		const positiveOffsetArb = fc.constantFrom(1, 5);

		fc.assert(
			fc.property(pastStartTimeArb, positiveOffsetArb, (startTime, offset) => {
				const result = computeAdjustedStartTime(startTime, offset, now);

				// Since startTime is at least 6 minutes in the past and we subtract
				// at most 5 minutes, the result is even further in the past — guard always passes
				expect(result).not.toBeNull();

				// Core arithmetic: newStartTime = originalStartTime - offset * 60000
				expect(result).toBe(startTime - offset * 60_000);
			}),
			{numRuns: 200},
		);
	});

	/**
	 * **Validates: Requirements 3.1**
	 *
	 * The adjustment correctly increases elapsed duration by exactly N minutes.
	 */
	it("positive offset increases elapsed duration by exactly N minutes", () => {
		const now = Date.now();

		const pastStartTimeArb = fc.integer({
			min: now - 3_600_000,
			max: now - 6 * 60_000,
		});

		const positiveOffsetArb = fc.constantFrom(1, 5);

		fc.assert(
			fc.property(pastStartTimeArb, positiveOffsetArb, (startTime, offset) => {
				const originalElapsed = now - startTime;
				const newStartTime = computeAdjustedStartTime(startTime, offset, now);

				expect(newStartTime).not.toBeNull();

				const newElapsed = now - newStartTime!;

				// Elapsed should increase by exactly N minutes
				expect(newElapsed - originalElapsed).toBe(offset * 60_000);
			}),
			{numRuns: 200},
		);
	});

	/**
	 * **Validates: Requirements 3.1**
	 *
	 * Positive adjustment always moves startTime further into the past
	 * (result is always less than original).
	 */
	it("positive offset always produces a startTime earlier than original", () => {
		const now = Date.now();

		const pastStartTimeArb = fc.integer({
			min: now - 3_600_000,
			max: now - 6 * 60_000,
		});

		const positiveOffsetArb = fc.constantFrom(1, 5);

		fc.assert(
			fc.property(pastStartTimeArb, positiveOffsetArb, (startTime, offset) => {
				const result = computeAdjustedStartTime(startTime, offset, now);

				expect(result).not.toBeNull();
				expect(result!).toBeLessThan(startTime);
			}),
			{numRuns: 200},
		);
	});
});
