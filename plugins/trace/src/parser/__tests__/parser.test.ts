import { describe, expect, it } from "vitest";
import { detectFormat, detectAndParse } from "../../parser";
import { normalizeStatus } from "../../parser/statusNormalizer";
import { parseTimestamp } from "../../parser/timestampParser";
import { DEFAULT_SETTINGS } from "../../settings/defaults";

describe("detectFormat", () => {
	it("detects table from pipe prefix", () => {
		const content = "| Date | Status |\n|------|--------|\n| 2026-01-01 | OPEN |";
		expect(detectFormat(content)).toBe("table");
	});

	it("detects csv from comma-separated header", () => {
		const content = "Date,Status,App\n2026-01-01,OPEN,MyApp";
		expect(detectFormat(content)).toBe("csv");
	});

	it("defaults to log for unstructured lines", () => {
		const content = "[2026-06-14T18:12:28] INFO Starting app";
		expect(detectFormat(content)).toBe("log");
	});
});

describe("parseTable", () => {
	it("parses pipe-delimited markdown table", () => {
		const content = [
			"| Date | Status | App | Message |",
			"|------|--------|-----|---------|",
			"| 2026-06-14 | OPEN | Shortcuts | Launched |",
		].join("\n");
		const { entries } = detectAndParse(content, { format: "table" }, DEFAULT_SETTINGS);
		expect(entries).toHaveLength(1);
		expect(entries[0].status).toBe("OPEN");
		expect(entries[0].statusCategory).toBe("success");
		expect(entries[0].subject).toBe("Shortcuts");
		expect(entries[0].message).toBe("Launched");
	});
});

describe("parseCsv", () => {
	it("parses CSV with header row", () => {
		const content = "Date,Status,App\n2026-06-14,ERROR,TestApp";
		const { entries } = detectAndParse(content, { format: "csv" }, DEFAULT_SETTINGS);
		expect(entries).toHaveLength(1);
		expect(entries[0].statusCategory).toBe("error");
		expect(entries[0].subject).toBe("TestApp");
	});
});

describe("parseLog", () => {
	it("parses bracket timestamp format", () => {
		const content = "[2026-06-14T18:12:28] INFO Starting app";
		const { entries } = detectAndParse(content, { format: "log" });
		expect(entries).toHaveLength(1);
		expect(entries[0].status).toBe("INFO");
		expect(entries[0].statusCategory).toBe("info");
		expect(entries[0].message).toBe("Starting app");
	});

	it("falls through to message-only for unmatched lines", () => {
		const content = "plain unstructured line";
		const { entries } = detectAndParse(content, { format: "log" });
		expect(entries[0].status).toBeNull();
		expect(entries[0].message).toBe("plain unstructured line");
	});
});

describe("normalizeStatus", () => {
	it("maps built-in values", () => {
		expect(normalizeStatus("ERROR")).toBe("error");
		expect(normalizeStatus("200")).toBe("success");
		expect(normalizeStatus("WARN")).toBe("warning");
	});

	it("uses custom mappings", () => {
		expect(normalizeStatus("LAUNCH", { LAUNCH: "success" })).toBe("success");
	});

	it("returns neutral for unknown", () => {
		expect(normalizeStatus("UNKNOWN")).toBe("neutral");
	});
});

describe("parseTimestamp", () => {
	it("parses ISO 8601", () => {
		const d = parseTimestamp("2026-06-14T18:12:28");
		expect(d).not.toBeNull();
		expect(d!.getFullYear()).toBe(2026);
	});
});
