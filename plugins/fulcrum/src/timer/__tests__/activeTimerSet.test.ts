import {describe, expect, it} from "vitest";
import {
	activeTimerDisplayKey,
	activeTimerDisplayKeys,
	activeTimerSetChanged,
} from "../activeTimerSet";

describe("activeTimerDisplayKeys", () => {
	it("returns sorted unique file paths", () => {
		expect(
			activeTimerDisplayKeys([
				{filePath: "b.md"},
				{filePath: "a.md"},
				{filePath: "b.md"},
			]),
		).toEqual(["a.md", "b.md"]);
	});

	it("joins paths into a stable set key", () => {
		expect(activeTimerDisplayKey([{filePath: "b.md"}, {filePath: "a.md"}])).toBe(
			"a.md\0b.md",
		);
	});
});

describe("activeTimerSetChanged", () => {
	it("is false when filtered live paths match displayed paths", () => {
		expect(activeTimerSetChanged(["p/a.md"], ["p/a.md"])).toBe(false);
	});

	it("is true when another project's timer is in memory but not displayed", () => {
		expect(activeTimerSetChanged(["p/a.md"], ["p/a.md", "other.md"])).toBe(true);
	});

	it("is true when the displayed project timer disappears", () => {
		expect(activeTimerSetChanged(["p/a.md"], [])).toBe(true);
	});

	it("ignores order", () => {
		expect(activeTimerSetChanged(["b.md", "a.md"], ["a.md", "b.md"])).toBe(false);
	});
});
