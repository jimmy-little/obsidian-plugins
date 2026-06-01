import type { NutritionFoodItem, NutritionMealEntry } from "./types";

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;

function inlineField(line: string, name: string): string | null {
	const re = new RegExp(`${name}::\\s*([^|]+)`, "i");
	const m = line.match(re);
	return m ? m[1]!.trim() : null;
}

function num(v: string | null): number {
	if (v == null || v === "" || Number.isNaN(Number(v))) return 0;
	return Number(v);
}

/** Parse `Name (180cal/36p)` or `Name (180cal/36p/4f/10c)` style food tokens. */
function parseFoodItem(token: string): NutritionFoodItem | null {
	const trimmed = token.trim();
	if (!trimmed) return null;

	const m = trimmed.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\s*cal(?:\/(\d+(?:\.\d+)?)\s*p)?(?:\/(\d+(?:\.\d+)?)\s*f)?(?:\/(\d+(?:\.\d+)?)\s*c)?\)$/i);
	if (m) {
		return {
			name: m[1]!.trim(),
			calories: Number(m[2]),
			protein: m[3] != null ? Number(m[3]) : 0,
			fat: m[4] != null ? Number(m[4]) : 0,
			netCarbs: m[5] != null ? Number(m[5]) : 0,
		};
	}

	return { name: trimmed, calories: 0, protein: 0, fat: 0, netCarbs: 0 };
}

/** Split item list on commas not inside parentheses (e.g. `Turkey (Ground, Cooked) (304cal/41p), …`). */
function splitFoodItemTokens(raw: string): string[] {
	const tokens: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === "(") depth++;
		else if (ch === ")") depth = Math.max(0, depth - 1);
		else if (ch === "," && depth === 0) {
			const token = raw.slice(start, i).trim();
			if (token) tokens.push(token);
			start = i + 1;
		}
	}
	const last = raw.slice(start).trim();
	if (last) tokens.push(last);
	return tokens;
}

function parseFoodItems(raw: string | null): NutritionFoodItem[] {
	if (!raw?.trim()) return [];
	return splitFoodItemTokens(raw)
		.map(parseFoodItem)
		.filter((x): x is NutritionFoodItem => x != null);
}

function extractListItemLines(content: string): string[] {
	const lines: string[] = [];
	for (const line of content.split("\n")) {
		const m = line.match(/^\s*[-*+]\s+(.+)$/);
		if (m) lines.push(m[1]!);
	}
	return lines;
}

function parseMealLine(line: string, monthPrefix: string | null): NutritionMealEntry | null {
	const meal = inlineField(line, "meal");
	if (!meal) return null;

	const dateFromText = line.match(ISO_DATE_RE)?.[0] ?? inlineField(line, "date");
	if (!dateFromText) return null;
	if (monthPrefix && !dateFromText.startsWith(monthPrefix)) return null;

	return {
		date: dateFromText,
		meal,
		time: inlineField(line, "time") ?? "",
		protein: num(inlineField(line, "protein")),
		fat: num(inlineField(line, "fat")),
		netCarbs: num(inlineField(line, "netCarbs")),
		calories: num(inlineField(line, "calories")),
		items: parseFoodItems(inlineField(line, "items")),
		summary: inlineField(line, "summary") ?? "",
		sourceLine: line,
	};
}

/**
 * Parse food-log list items from a monthly nutrition note.
 * Expects inline fields: meal, calories, protein, fat, netCarbs, items, time, summary.
 */
export function parseNutritionLogContent(content: string, monthPrefix: string | null = null): NutritionMealEntry[] {
	const entries: NutritionMealEntry[] = [];
	for (const line of extractListItemLines(content)) {
		const entry = parseMealLine(line, monthPrefix);
		if (entry) entries.push(entry);
	}
	return entries;
}

export function monthPrefixFromFileName(basename: string): string | null {
	const m = basename.match(/^(\d{4})-(\d{2})/);
	return m ? `${m[1]}-${m[2]}` : null;
}
