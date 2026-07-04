import type { TraceSettings } from "../types";

export const DEFAULT_TOKEN_COLORS_DARK = {
	timestamp: "#7EC8E3",
	success: "#6DBF6D",
	error: "#E06C6C",
	warning: "#E5C07B",
	info: "#ABB2BF",
	neutral: "#6B6B6B",
	subject: "#C678DD",
	comment: "#5C6370",
};

export const DEFAULT_TOKEN_COLORS_LIGHT = {
	timestamp: "#1A6A8A",
	success: "#2A7A2A",
	error: "#9A2020",
	warning: "#8A6A00",
	info: "#555B66",
	neutral: "#999999",
	subject: "#6A1A8A",
	comment: "#888888",
};

export const DEFAULT_SETTINGS: TraceSettings = {
	columnAliases: {
		timestamp: "Date, Timestamp, Time",
		status: "Status, Level, Severity",
		subject: "App, URL, Source, File",
		message: "Message, Note, Comment",
	},
	csvDelimiter: ",",
	customStatusMappings: {},
	tokenColors: { ...DEFAULT_TOKEN_COLORS_DARK },
	defaultQueryLimit: 100,
};

export function applyTokenColorCss(settings: TraceSettings): void {
	const root = document.documentElement;
	const c = settings.tokenColors;
	root.style.setProperty("--trace-color-timestamp", c.timestamp);
	root.style.setProperty("--trace-color-success", c.success);
	root.style.setProperty("--trace-color-error", c.error);
	root.style.setProperty("--trace-color-warning", c.warning);
	root.style.setProperty("--trace-color-info", c.info);
	root.style.setProperty("--trace-color-neutral", c.neutral);
	root.style.setProperty("--trace-color-subject", c.subject);
	root.style.setProperty("--trace-color-comment", c.comment);
}
