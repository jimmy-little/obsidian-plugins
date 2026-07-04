import type { StatusCategory, TraceSettings } from "../types";

const BUILTIN_STATUS_MAP: Record<string, StatusCategory> = {
	OPEN: "success",
	SUCCESS: "success",
	OK: "success",
	"200": "success",
	"201": "success",
	"204": "success",
	STARTED: "success",
	RUNNING: "success",
	PASS: "success",
	ERROR: "error",
	FAIL: "error",
	FAILED: "error",
	CLOSED: "error",
	CRASH: "error",
	"400": "error",
	"401": "error",
	"403": "error",
	"404": "error",
	"500": "error",
	"502": "error",
	"503": "error",
	WARN: "warning",
	WARNING: "warning",
	DEPRECATED: "warning",
	TIMEOUT: "warning",
	"301": "warning",
	"302": "warning",
	"429": "warning",
	INFO: "info",
	DEBUG: "info",
	LOG: "info",
	TRACE: "info",
	NOTICE: "info",
};

export function normalizeStatus(
	raw: string | null,
	customMappings: Record<string, StatusCategory> = {},
): StatusCategory {
	if (!raw) return "neutral";
	const key = raw.trim().toUpperCase();
	if (customMappings[key]) return customMappings[key];
	if (customMappings[raw.trim()]) return customMappings[raw.trim()];
	if (BUILTIN_STATUS_MAP[key]) return BUILTIN_STATUS_MAP[key];
	return "neutral";
}

export function statusCategoryClass(category: StatusCategory): string {
	return `trace-status-${category}`;
}
