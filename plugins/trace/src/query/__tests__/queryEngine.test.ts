import { describe, expect, it } from "vitest";
import { filterEntries, defaultFilterState } from "../../filter/filterState";
import type { LogEntry } from "../../types";
import {
	groupEntries,
	parseTraceBlockSource,
	queryEntries,
} from "../queryEngine";

const sampleEntries: LogEntry[] = [
	{
		timestamp: new Date("2026-06-10T12:00:00"),
		status: "OPEN",
		statusCategory: "success",
		subject: "Shortcuts",
		message: "Launched",
		raw: "line1",
		lineNumber: 1,
	},
	{
		timestamp: new Date("2026-06-15T12:00:00"),
		status: "ERROR",
		statusCategory: "error",
		subject: "Other",
		message: "Failed",
		raw: "line2",
		lineNumber: 2,
	},
	{
		timestamp: null,
		status: "WARN",
		statusCategory: "warning",
		subject: "Shortcuts",
		message: "Timeout",
		raw: "line3",
		lineNumber: 3,
	},
];

describe("parseTraceBlockSource", () => {
	it("parses query block parameters", () => {
		const source = [
			'source: "logs/app-log.md"',
			"status: ERROR, WARN",
			"date-from: 2026-06-01",
			"limit: 50",
			"group-by: status",
			"display: summary",
		].join("\n");
		const params = parseTraceBlockSource(source);
		expect(params?.source).toBe("logs/app-log.md");
		expect(params?.status).toEqual(["ERROR", "WARN"]);
		expect(params?.dateFrom).toBe("2026-06-01");
		expect(params?.limit).toBe(50);
		expect(params?.groupBy).toBe("status");
		expect(params?.display).toBe("summary");
	});
});

describe("queryEntries", () => {
	it("filters by status category and keyword", () => {
		const results = queryEntries(
			sampleEntries,
			{ source: "x", status: ["error"], keyword: "Failed" },
			100,
		);
		expect(results).toHaveLength(1);
		expect(results[0].status).toBe("ERROR");
	});

	it("filters by date range", () => {
		const results = queryEntries(
			sampleEntries,
			{ source: "x", dateFrom: "2026-06-14", dateTo: "2026-06-20" },
			100,
		);
		expect(results).toHaveLength(1);
		expect(results[0].status).toBe("ERROR");
	});

	it("respects limit", () => {
		const results = queryEntries(sampleEntries, { source: "x" }, 2);
		expect(results).toHaveLength(2);
	});
});

describe("filterEntries", () => {
	it("filters by keyword across fields", () => {
		const state = defaultFilterState();
		state.keyword = "shortcuts";
		const results = filterEntries(sampleEntries, state);
		expect(results).toHaveLength(2);
	});
});

describe("groupEntries", () => {
	it("groups by raw status", () => {
		const groups = groupEntries(sampleEntries, "status");
		expect(groups.find((g) => g.key === "OPEN")?.count).toBe(1);
		expect(groups.find((g) => g.key === "ERROR")?.count).toBe(1);
	});

	it("groups by date with unknown bucket", () => {
		const groups = groupEntries(sampleEntries, "date");
		expect(groups.some((g) => g.key === "unknown")).toBe(true);
	});
});
