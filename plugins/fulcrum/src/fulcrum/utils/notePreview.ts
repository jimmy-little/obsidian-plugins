import {
	buildMultilineFeedPreview,
	stripBlockquoteLines,
	stripFencedCodeBlocks,
	stripObsidianCallouts,
	stripYamlFrontmatter,
} from "@obsidian-suite/note-preview";

export function parseTagsFromFm(fm: Record<string, unknown> | undefined): string[] {
	if (!fm) return [];
	const t = fm.tags;
	const out: string[] = [];
	if (Array.isArray(t)) {
		for (const x of t) {
			const s = String(x).trim().replace(/^#/, "");
			if (s) out.push(s);
		}
	} else if (typeof t === "string") {
		for (const part of t.split(/[\s,]+/)) {
			const s = part.trim().replace(/^#/, "");
			if (s) out.push(s);
		}
	}
	const seen = new Set<string>();
	const dedup: string[] = [];
	for (const x of out) {
		const lc = x.toLowerCase();
		if (seen.has(lc)) continue;
		seen.add(lc);
		dedup.push(x);
	}
	return dedup;
}

function escapeFieldKeyForRegex(key: string): string {
	return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Inline `Key:: value` (optional bold around key). */
export function readInlineField(body: string, fieldKey: string): string | undefined {
	const k = fieldKey.trim();
	if (!k) return undefined;
	const re = new RegExp(
		`^[ \\t]*(?:\\*\\*)?${escapeFieldKeyForRegex(k)}(?:\\*\\*)?[ \\t]*::[ \\t]*(.*)$`,
		"im",
	);
	const m = body.match(re);
	return m?.[1]?.trim() || undefined;
}

export function resolveNoteType(body: string, fmType: string | undefined): string | undefined {
	if (fmType?.trim()) return fmType.trim();
	const inline = readInlineField(body, "type");
	return inline?.trim() || undefined;
}

export function resolveEntryTitle(params: {
	body: string;
	fmEntry: string | undefined;
	basename: string;
	entryFieldKey: string;
}): string {
	const {body, fmEntry, basename, entryFieldKey} = params;
	if (fmEntry?.trim()) return fmEntry.trim();
	const k = entryFieldKey.trim();
	const inline = k ? readInlineField(body, k) : undefined;
	if (inline) return inline;
	const inlineEntry = readInlineField(body, "entry");
	if (inlineEntry) return inlineEntry;
	const hm = body.match(/^#{1,6}[ \t]+(.+)$/m);
	if (hm?.[1]) return hm[1].trim();
	return basename.replace(/\.md$/i, "");
}

/**
 * Short single-line preview for indexes (VaultIndex); still strips structural noise via suite package.
 */
export function buildNoteBodyPreview(
	body: string,
	entryTitle: string,
	entryFieldKey: string,
): string | undefined {
	let t = stripYamlFrontmatter(body);
	t = stripFencedCodeBlocks(t);
	t = stripObsidianCallouts(t);
	t = stripBlockquoteLines(t);
	const multi = buildMultilineFeedPreview(t, {
		maxLines: 80,
		entryFieldKey,
		displayTitle: entryTitle,
	});
	if (!multi) return undefined;
	const oneLine = multi.replace(/\s+/g, " ").trim();
	if (!oneLine || oneLine.toLowerCase() === entryTitle.toLowerCase()) return undefined;
	return oneLine.length > 320 ? `${oneLine.slice(0, 317).trimEnd()}…` : oneLine;
}
