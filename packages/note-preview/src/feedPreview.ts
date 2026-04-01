import {
	stripFencedCodeBlocks,
	stripObsidianCallouts,
	stripYamlFrontmatter,
} from "./strip";

export type FeedPreviewOptions = {
	/** Max content lines after cleanup (default 10). */
	maxLines?: number;
	/** Obsidian inline `Key:: value` — drops entry/type and this key (e.g. atomic `entry` field). */
	entryFieldKey?: string;
	/** When the first heading matches this (case-insensitive), it is removed as duplicate of the title. */
	displayTitle?: string;
};

/**
 * Readable multi-line preview for timeline/feed cards: skips frontmatter, fenced blocks,
 * Obsidian callouts, metadata-ish inline fields, then caps line count.
 */
export function buildMultilineFeedPreview(
	markdown: string,
	options: FeedPreviewOptions,
): string | undefined {
	const maxLines = Math.max(1, options.maxLines ?? 10);

	let t = stripYamlFrontmatter(markdown);
	t = stripFencedCodeBlocks(t);
	t = stripObsidianCallouts(t);

	const iKey = (options.entryFieldKey ?? "").trim().toLowerCase();
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

	let bodyLines = kept.join("\n").split(/\r?\n/);

	let startIdx = 0;
	const dt = options.displayTitle?.trim();
	if (dt) {
		const dtl = dt.toLowerCase();
		for (let i = 0; i < bodyLines.length; i++) {
			const line = bodyLines[i]!;
			if (!line.trim()) continue;
			const hm = line.match(/^#{1,6}\s+(.+)$/);
			if (hm && hm[1].trim().toLowerCase() === dtl) {
				startIdx = i + 1;
				break;
			}
			break;
		}
	}

	const sliced = bodyLines.slice(startIdx);
	while (sliced.length && !sliced[0]!.trim()) sliced.shift();
	while (sliced.length && !sliced[sliced.length - 1]!.trim()) sliced.pop();

	if (sliced.length === 0) return undefined;

	const out = sliced.slice(0, maxLines);
	const hadMore = sliced.length > maxLines;
	if (hadMore) {
		const last = out[out.length - 1]!;
		out[out.length - 1] = `${last.replace(/\s+$/, "")}…`;
	}

	const result = out.join("\n").trim();
	if (!result) return undefined;

	if (dt && result.replace(/\s+/g, " ").toLowerCase() === dt.replace(/\s+/g, " ").toLowerCase()) {
		return undefined;
	}

	return result;
}
