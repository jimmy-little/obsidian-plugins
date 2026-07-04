import {describe, expect, it} from "vitest";
import {
	buildRecurringOccurrenceAdvancePatch,
	computeNextOccurrences,
} from "../recurrenceEngine";

const recurrence = "DTSTART:20260629T120000;FREQ=WEEKLY;INTERVAL=2;BYDAY=MO";

const keys = {
	status: "status",
	completedDate: "completedDate",
	scheduled: "scheduled",
	due: "due",
	completeInstances: "complete_instances",
	skippedInstances: "skipped_instances",
	openStatus: "OPEN",
	doneStatus: "DONE",
	maintainDueOffset: false,
};

describe("buildRecurringOccurrenceAdvancePatch", () => {
	it("advances scheduled and due to the next occurrence on complete", () => {
		const patch = buildRecurringOccurrenceAdvancePatch(
			"2026-06-29",
			{
				recurrence,
				scheduledDate: "2026-06-29",
				dueDate: "2026-06-29",
				recurrenceAnchor: "scheduled",
				completeInstances: [],
				skippedInstances: [],
			},
			keys,
			"complete",
		);

		expect(patch.complete_instances).toEqual(["2026-06-29"]);
		expect(patch.scheduled).toBe("2026-07-13");
		expect(patch.due).toBe("2026-07-13");
		expect(patch.status).toBe("OPEN");
		expect(
			computeNextOccurrences(
				recurrence,
				patch.scheduled as string,
				patch.complete_instances as string[],
				[],
				3,
			),
		).toEqual(["2026-07-13", "2026-07-27", "2026-08-10"]);
	});

	it("completes the current scheduled occurrence when prior completions exist", () => {
		const patch = buildRecurringOccurrenceAdvancePatch(
			"2026-07-13",
			{
				recurrence,
				scheduledDate: "2026-07-13",
				dueDate: "2026-06-29",
				recurrenceAnchor: "scheduled",
				completeInstances: ["2026-07-01"],
				skippedInstances: [],
			},
			keys,
			"complete",
		);

		expect(patch.complete_instances).toEqual(["2026-07-01", "2026-07-13"]);
		expect(patch.scheduled).toBe("2026-07-27");
		expect(patch.due).toBe("2026-07-27");
	});

	it("records skipped_instances and advances dates on skip", () => {
		const patch = buildRecurringOccurrenceAdvancePatch(
			"2026-06-29",
			{
				recurrence,
				scheduledDate: "2026-06-29",
				dueDate: "2026-06-29",
				recurrenceAnchor: "scheduled",
				completeInstances: [],
				skippedInstances: [],
			},
			keys,
			"skip",
		);

		expect(patch.skipped_instances).toEqual(["2026-06-29"]);
		expect(patch.complete_instances).toEqual([]);
		expect(patch.scheduled).toBe("2026-07-13");
		expect(patch.due).toBe("2026-07-13");
	});
});
