import type { App, CachedMetadata, TFile } from "obsidian";
import type { MediaKind } from "./media";
import type { ReposeSettings, TypeMatchRule } from "./settings";

export function normalizeVaultPath(p: string): string {
	return p
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

export function parseFrontmatterKeyValue(spec: string): { key: string; value: string } | null {
	const t = spec.trim();
	const i = t.indexOf(":");
	if (i <= 0) return null;
	const key = t.slice(0, i).trim();
	const value = t.slice(i + 1).trim();
	if (!key) return null;
	return { key, value };
}

function collectTagStrings(meta: CachedMetadata | null): string[] {
	if (!meta) return [];
	const out = new Set<string>();
	if (meta.tags) {
		for (const tc of meta.tags) {
			const raw = (tc.tag ?? "").replace(/^#/, "").trim();
			if (raw) out.add(raw);
		}
	}
	const fmTags = meta.frontmatter?.tags;
	if (typeof fmTags === "string") {
		const raw = fmTags.replace(/^#/, "").trim();
		if (raw) out.add(raw);
	} else if (Array.isArray(fmTags)) {
		for (const x of fmTags) {
			if (typeof x === "string") {
				const raw = x.replace(/^#/, "").trim();
				if (raw) out.add(raw);
			}
		}
	}
	return [...out];
}

function frontmatterValueEquals(
	fm: Record<string, unknown> | undefined,
	key: string,
	expected: string,
): boolean {
	if (!fm || !(key in fm)) return false;
	const v = fm[key];
	if (v == null) return false;
	if (typeof v === "string") return v.trim() === expected;
	if (typeof v === "number" || typeof v === "boolean") return String(v) === expected;
	if (Array.isArray(v)) {
		return v.some((x) => typeof x === "string" && x.trim() === expected);
	}
	return false;
}

export function fileMatchesRule(app: App, file: TFile, rule: TypeMatchRule): boolean {
	const needle = rule.text.trim();
	if (!needle) return false;
	const meta = app.metadataCache.getFileCache(file);

	if (rule.mode === "folder") {
		const folder = normalizeVaultPath(needle);
		if (!folder) return false;
		const path = file.path.replace(/\\/g, "/");
		return path === folder || path.startsWith(`${folder}/`);
	}

	if (rule.mode === "tag") {
		const tags = collectTagStrings(meta);
		return tags.includes(needle);
	}

	const parsed = parseFrontmatterKeyValue(needle);
	if (!parsed) return false;
	return frontmatterValueEquals(meta?.frontmatter, parsed.key, parsed.value);
}

export function classifyFile(app: App, file: TFile, settings: ReposeSettings): MediaKind[] {
	const kinds: MediaKind[] = [];
	for (const k of Object.keys(settings.typeRules) as MediaKind[]) {
		if (fileMatchesRule(app, file, settings.typeRules[k])) kinds.push(k);
	}
	return kinds;
}
