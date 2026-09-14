import {describe, expect, it} from "vitest";
import {clampTodayAgendaWidth, TODAY_AGENDA_MIN_PX, TODAY_SPLIT_PX, TODAY_TASKS_MIN_PX} from "../todayLayout";

describe("clampTodayAgendaWidth", () => {
	it("keeps both columns above the minimum", () => {
		expect(clampTodayAgendaWidth(10, 800)).toBe(TODAY_AGENDA_MIN_PX);
		expect(clampTodayAgendaWidth(900, 800)).toBe(800 - TODAY_SPLIT_PX - TODAY_TASKS_MIN_PX);
		expect(clampTodayAgendaWidth(400, 800)).toBe(400);
	});
});
