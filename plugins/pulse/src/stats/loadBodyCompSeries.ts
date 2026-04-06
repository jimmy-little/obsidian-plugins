import type { Vault } from "obsidian";
import { parseFrontmatter } from "../import/parsers";
import type { BodyCompDay } from "./bodyCompTypes";
import { BODY_METRIC_DEFS } from "./bodyCompTypes";

function escapeRegexChar(c: string): string {
	return /[.*+?^${}()|[\]\\]/.test(c) ? "\\" + c : c;
}

/** Build a regex that matches paths produced by statsNotePathTemplate. */
export function statsNotePathPattern(template: string): RegExp {
	const t = template.trim().replace(/\\/g, "/");
	let s = "";
	for (let i = 0; i < t.length; ) {
		if (t.slice(i, i + 6) === "{year}") {
			s += "(\\d{4})";
			i += 6;
		} else if (t.slice(i, i + 7) === "{month}") {
			s += "(\\d{2})";
			i += 7;
		} else if (t.slice(i, i + 6) === "{date}") {
			s += "(\\d{4}-\\d{2}-\\d{2})";
			i += 6;
		} else {
			s += escapeRegexChar(t[i]!);
			i++;
		}
	}
	return new RegExp("^" + s + "$");
}

function parseFmNumber(v: string | number | undefined): number | undefined {
	if (v === undefined || v === null) return undefined;
	if (typeof v === "number" && !Number.isNaN(v)) return v;
	const s = String(v).trim();
	if (s === "") return undefined;
	const n = parseFloat(s.replace(/,/g, ""));
	return Number.isNaN(n) ? undefined : n;
}

function rowFromFrontmatter(
	date: string,
	fm: Record<string, string | number>
): BodyCompDay {
	const row: BodyCompDay = { date };
	for (const { key } of BODY_METRIC_DEFS) {
		const n = parseFmNumber(fm[key]);
		if (n !== undefined) row[key] = n;
	}
	return row;
}

/**
 * Load daily body composition rows from stats notes matching the user's path template.
 */
export async function loadBodyCompSeries(
	vault: Vault,
	statsNotePathTemplate: string
): Promise<BodyCompDay[]> {
	const pattern = statsNotePathPattern(statsNotePathTemplate);
	const files = vault.getMarkdownFiles().filter((f) => pattern.test(f.path.replace(/\\/g, "/")));
	const rows: BodyCompDay[] = [];

	for (const file of files) {
		try {
			const text = await vault.read(file);
			const { frontmatter } = parseFrontmatter(text);
			const m = file.path.replace(/\\/g, "/").match(/(\d{4}-\d{2}-\d{2})\.md$/i);
			const dateStr =
				(typeof frontmatter.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date.trim()))
					? frontmatter.date.trim()
					: m?.[1];
			if (!dateStr) continue;

			const row = rowFromFrontmatter(dateStr, frontmatter);
			const hasMetric = BODY_METRIC_DEFS.some((d) => row[d.key] != null);
			if (hasMetric) rows.push(row);
		} catch {
			/* skip */
		}
	}

	rows.sort((a, b) => a.date.localeCompare(b.date));
	return rows;
}
