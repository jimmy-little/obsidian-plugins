import type { LogFormat, ParseOptions, ParsedLog, TraceSettings } from "../types";
import { parseCsv } from "./csvParserMain";
import { parseLogLines } from "./logParser";
import { parseTable } from "./tableParser";

const SAMPLE_LINES = 20;

export function detectFormat(content: string, hint?: LogFormat): LogFormat {
	if (hint && (hint === "table" || hint === "csv" || hint === "log")) return hint;

	const lines = content
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(0, SAMPLE_LINES);

	for (const line of lines) {
		if (line.startsWith("|")) return "table";
	}

	if (lines.length > 0) {
		const first = lines[0];
		const commaCount = (first.match(/,/g) ?? []).length;
		if (commaCount >= 2 && !first.startsWith("[")) return "csv";
	}

	return "log";
}

export function parseLogFile(
	content: string,
	options: ParseOptions,
	settings?: TraceSettings,
): ParsedLog {
	const format = options.format;
	let entries;
	switch (format) {
		case "table":
			entries = parseTable(content, options, settings);
			break;
		case "csv":
			entries = parseCsv(content, options, settings);
			break;
		case "log":
		default:
			entries = parseLogLines(content, options);
			break;
	}
	return { entries, format };
}

export function detectAndParse(
	content: string,
	options: Omit<ParseOptions, "format"> & { format?: LogFormat },
	settings?: TraceSettings,
): ParsedLog {
	const format = detectFormat(content, options.format);
	return parseLogFile(content, { ...options, format }, settings);
}
