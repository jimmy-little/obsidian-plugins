/** Remove fenced ``` / ~~~ blocks (code, Dataview, etc.). */
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

export function stripYamlFrontmatter(markdown: string): string {
	if (!markdown.startsWith("---")) return markdown;
	const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	return m ? markdown.slice(m[0].length) : markdown;
}

/**
 * Obsidian callouts: lines starting with `> [!type]`; continuation lines are typically `> ...` or blank inside the block.
 */
export function stripObsidianCallouts(markdown: string): string {
	const lines = markdown.split(/\r?\n/);
	const out: string[] = [];
	let inCallout = false;
	for (const line of lines) {
		if (inCallout) {
			if (/^\s*>/.test(line) || /^\s*$/.test(line)) continue;
			inCallout = false;
		}
		if (/^\s*>\s*\[!([^\]]+)\]/.test(line)) {
			inCallout = true;
			continue;
		}
		out.push(line);
	}
	return out.join("\n");
}

/** Drop blockquote lines (optional aggressive pass for index excerpts). */
export function stripBlockquoteLines(markdown: string): string {
	return markdown
		.split(/\r?\n/)
		.filter((line) => !/^\s*>/.test(line))
		.join("\n");
}
