import type { TraceSettings } from "../types";

const FIELD_ALIASES: Record<string, string[]> = {
	timestamp: ["date", "time", "timestamp", "datetime", "ts", "logged_at", "created_at"],
	status: ["status", "level", "severity", "type", "event", "code"],
	subject: ["app", "url", "page", "file", "source", "target", "name", "resource"],
	message: ["message", "msg", "note", "comment", "description", "detail"],
};

export function parseAliasList(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

export function buildAliasMap(settings: TraceSettings): Record<string, string[]> {
	return {
		timestamp: [
			...FIELD_ALIASES.timestamp,
			...parseAliasList(settings.columnAliases.timestamp),
		],
		status: [...FIELD_ALIASES.status, ...parseAliasList(settings.columnAliases.status)],
		subject: [...FIELD_ALIASES.subject, ...parseAliasList(settings.columnAliases.subject)],
		message: [...FIELD_ALIASES.message, ...parseAliasList(settings.columnAliases.message)],
	};
}

export function matchHeaderToField(
	header: string,
	aliasMap: Record<string, string[]>,
	explicit?: { timestamp?: string; status?: string; subject?: string; message?: string },
): "timestamp" | "status" | "subject" | "message" | null {
	const h = header.trim();
	const lower = h.toLowerCase();
	if (explicit) {
		for (const [field, value] of Object.entries(explicit)) {
			if (value && value.trim().toLowerCase() === lower) {
				return field as "timestamp" | "status" | "subject" | "message";
			}
		}
	}
	for (const [field, aliases] of Object.entries(aliasMap)) {
		if (aliases.includes(lower) || aliases.includes(h)) {
			return field as "timestamp" | "status" | "subject" | "message";
		}
	}
	return null;
}

export function resolveColumnIndices(
	headers: string[],
	aliasMap: Record<string, string[]>,
	explicit?: { timestamp?: string; status?: string; subject?: string; message?: string },
): Record<"timestamp" | "status" | "subject" | "message", number | null> {
	const result: Record<"timestamp" | "status" | "subject" | "message", number | null> = {
		timestamp: null,
		status: null,
		subject: null,
		message: null,
	};
	headers.forEach((header, i) => {
		const field = matchHeaderToField(header, aliasMap, explicit);
		if (field && result[field] === null) result[field] = i;
	});
	return result;
}
