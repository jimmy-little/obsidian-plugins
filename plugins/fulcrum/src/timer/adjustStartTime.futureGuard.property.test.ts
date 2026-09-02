import {describe, it, expect} from "vitest";
import * as fc from "fast-check";

/**
 * Property 4: Adjustment never produces a future startTime
 *
 * For any active timer entry and for any adjustment offset (positive or negative),
 * after the adjustment is applied (or rejected), entry.startTime SHALL be less than
 * or equal to Date.now(). Equivalently, elapsed duration is always non-negative.
 *
 * **Validates: Requirements 3.4**
 */

/**
 * Pure extraction of the adjustStartTime guard logic from ActiveTimersPanel.
 * This mirrors the logic in ActiveTimersPanel.adjustStartTime() without
 * DOM or persistence side effects.
 */
import {shiftRunningTimerStart} from "../fulcrum/utils/timerEntries";

function applyAdjustment(startTime: number, offsetMinutes: number): number {
	return shiftRunningTimerStart(startTime, offsetMinutes, Date.now()) ?? startTime;
}

describe("Property 4: Adjustment never produces a future startTime", () => {
	it("after adjustment, entry.startTime <= Date.now() ALWAYS holds (100+ iterations)", () => {
		fc.assert(
			fc.property(
				// Generate startTime values: valid past timestamps (within last 24h to near now)
				fc.integer({min: Date.now() - 24 * 60 * 60 * 1000, max: Date.now()}),
				// Generate offset values: both positive and negative, including large values
				fc.integer({min: -1440, max: 1440}), // ±1440 minutes = ±24 hours
				(startTime, offsetMinutes) => {
					const resultStartTime = applyAdjustment(startTime, offsetMinutes);
					// Invariant: resultStartTime must never be in the future
					expect(resultStartTime).toBeLessThanOrEqual(Date.now());
				},
			),
			{numRuns: 200},
		);
	});

	it("rejects adjustment when it would produce a future startTime", () => {
		fc.assert(
			fc.property(
				// Generate startTime values near Date.now() to trigger the guard
				fc.integer({min: Date.now() - 5 * 60 * 1000, max: Date.now()}),
				// Generate negative offsets large enough to push startTime into the future
				fc.integer({min: -1440, max: -1}),
				(startTime, offsetMinutes) => {
					const offsetMs = offsetMinutes * 60 * 1000;
					const wouldBeStartTime = startTime - offsetMs;

					const resultStartTime = applyAdjustment(startTime, offsetMinutes);

					if (wouldBeStartTime > Date.now()) {
						// Guard should reject: startTime unchanged
						expect(resultStartTime).toBe(startTime);
					} else {
						// Guard passes: startTime is adjusted
						expect(resultStartTime).toBe(wouldBeStartTime);
					}

					// In all cases, the invariant holds
					expect(resultStartTime).toBeLessThanOrEqual(Date.now());
				},
			),
			{numRuns: 200},
		);
	});

	it("handles edge cases near Date.now() boundary", () => {
		fc.assert(
			fc.property(
				// startTime exactly at or very near Date.now()
				fc.integer({min: Date.now() - 1000, max: Date.now()}),
				// Small offsets that test the boundary precisely
				fc.oneof(
					fc.constant(-1),
					fc.constant(-5),
					fc.constant(1),
					fc.constant(5),
					fc.integer({min: -10, max: 10}),
				),
				(startTime, offsetMinutes) => {
					const resultStartTime = applyAdjustment(startTime, offsetMinutes);
					// Invariant always holds regardless of how close to boundary
					expect(resultStartTime).toBeLessThanOrEqual(Date.now());
				},
			),
			{numRuns: 200},
		);
	});

	it("handles large positive and negative offsets without violating invariant", () => {
		fc.assert(
			fc.property(
				// Any valid past startTime
				fc.integer({min: Date.now() - 7 * 24 * 60 * 60 * 1000, max: Date.now()}),
				// Extreme offsets
				fc.oneof(
					fc.integer({min: -10000, max: -100}),
					fc.integer({min: 100, max: 10000}),
				),
				(startTime, offsetMinutes) => {
					const resultStartTime = applyAdjustment(startTime, offsetMinutes);
					// Invariant: never in the future
					expect(resultStartTime).toBeLessThanOrEqual(Date.now());
				},
			),
			{numRuns: 100},
		);
	});
});
