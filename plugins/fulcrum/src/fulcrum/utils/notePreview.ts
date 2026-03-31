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

/** Remove fenced ``` / ~~~ blocks (Dataview, code, etc.). */
export function stripFencedCodeBlocks(markdown: string): string {
	const lines = markdown.split(/\r?\n/);
	const out: string[] = [];
	let inFence = false;
	for (const line of lines) {
		if (/^\s*((?:`{3,}|~{3,}))/u.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (!inFence) out.push(line);
	}
	return out.join("\n");
}

export function stripBlockquoteLines(markdown: string): string {
	return markdown
		.split(/\r?\n/)
		.filter((line) => !/^\s*>/.test(line))
		.join("\n");
}

export function stripYamlFrontmatter(markdown: string): string {
	if (!markdown.startsWith("---")) return markdown;
	const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	return m ? markdown.slice(m[0].length) : markdown;
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

/** Short plain-text preview after stripping noise and inline metadata lines. */
export function buildNoteBodyPreview(
	body: string,
	entryTitle: string,
	entryFieldKey: string,
): string | undefined {
	let t = stripYamlFrontmatter(body);
	t = stripFencedCodeBlocks(t);
	t = stripBlockquoteLines(t);
	const iKey = entryFieldKey.trim().toLowerCase();
	const lines = t.split(/\r?\n/);
	const kept: string[] = [];
	for (const line of lines) {
		const m = line.trim().match(/^(?:\*\*)?([^:*]+?)(?:\*\*)?\s*::\s*(.*)$/i);
		if (m?.[1]) {
			const name = m[1].replace(/\s+/g, " ").trim().toLowerCase();
			if (name === iKey || name === "entry" || name === "type") continue;
		}
		kept.push(line);
	}
	t = kept.join("\n").trim();
	t = t.replace(/^#{1,6}[ \t]+[^\n]+\n?/m, "").trim();
	t = t.replace(/\s+/g, " ").trim();
	if (!t || t.toLowerCase() === entryTitle.toLowerCase()) return undefined;
	return t.length > 320 ? `${t.slice(0, 317).trimEnd()}…` : t;
}
