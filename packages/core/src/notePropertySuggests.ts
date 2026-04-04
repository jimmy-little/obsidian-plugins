import {AbstractInputSuggest, type App, prepareSimpleSearch, TFile} from "obsidian";

/** Obsidian exposes tag counts on the metadata cache (may be absent in older API typings). */
function tagNamesFromVault(app: App): string[] {
	const ext = app.metadataCache as unknown as {getTags?: () => Record<string, number>};
	const rec = ext.getTags?.();
	if (rec && typeof rec === "object") return Object.keys(rec);
	return [];
}

/** Obsidian frontmatter key suggestions from across the vault. */
export class PropertyKeySuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		textInputEl: HTMLInputElement,
		private readonly allKeys: string[],
	) {
		super(app, textInputEl);
	}

	getSuggestions(query: string): string[] {
		const q = query.trim().toLowerCase();
		if (!q) return this.allKeys.slice(0, 40);
		return this.allKeys.filter((k) => k.toLowerCase().includes(q)).slice(0, 40);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		void evt;
		this.setValue(value);
	}
}

export type PropertyValueSuggestItem = {
	insert: string;
	label: string;
	detail?: string;
};

export function gatherAllPropertyKeys(app: App): string[] {
	const s = new Set<string>();
	for (const f of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(f)?.frontmatter;
		if (!fm) continue;
		for (const k of Object.keys(fm)) s.add(k);
	}
	return [...s].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
}

export function gatherValueHistoryForKey(app: App, propKey: string, query: string): string[] {
	const pk = propKey.trim();
	if (!pk) return [];
	const ql = query.trim().toLowerCase();
	const out: string[] = [];
	const seen = new Set<string>();

	for (const f of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(f)?.frontmatter;
		if (!fm || !(pk in fm)) continue;
		const v = fm[pk];
		const add = (x: string): void => {
			const t = x.trim();
			if (!t || seen.has(t)) return;
			if (ql && !t.toLowerCase().includes(ql)) return;
			seen.add(t);
			out.push(t);
		};
		if (typeof v === "string") add(v);
		else if (typeof v === "number" || typeof v === "boolean") add(String(v));
		else if (Array.isArray(v)) {
			for (const x of v) {
				if (typeof x === "string") add(x);
			}
		}
		if (out.length >= 120) break;
	}
	return out.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"})).slice(0, 50);
}

export function partialWikilinkNeedle(
	value: string,
): {replaceStart: number; replaceEnd: number; needle: string} | null {
	const open = value.lastIndexOf("[[");
	if (open === -1) return null;
	const afterOpen = value.slice(open + 2);
	if (afterOpen.includes("]]")) return null;
	const pipe = afterOpen.indexOf("|");
	const searchChunk = pipe >= 0 ? afterOpen.slice(0, pipe) : afterOpen;
	return {
		replaceStart: open + 2,
		replaceEnd: value.length,
		needle: searchChunk.trim(),
	};
}

export function partialTagNeedle(value: string): {hashIdx: number; needle: string} | null {
	const m = value.match(/#([^\s#,]*)$/);
	if (!m || m.index === undefined) return null;
	return {hashIdx: m.index, needle: m[1] ?? ""};
}

/**
 * Value field suggest: `[[` → vault files (wikilink text), `#` / `tags` key → tags, else → prior values for property key.
 */
export class PersonPropertyValueSuggest extends AbstractInputSuggest<PropertyValueSuggestItem> {
	constructor(
		app: App,
		textInputEl: HTMLInputElement,
		private readonly sourcePath: string,
		private readonly getRowKey: () => string,
	) {
		super(app, textInputEl);
	}

	getSuggestions(query: string): PropertyValueSuggestItem[] {
		const w = partialWikilinkNeedle(query);
		if (w) {
			const matcher = w.needle ? prepareSimpleSearch(w.needle) : () => null;
			const files: TFile[] = [];
			for (const f of this.app.vault.getMarkdownFiles()) {
				if (w.needle) {
					if (!matcher(f.basename) && !matcher(f.path)) continue;
				}
				files.push(f);
				if (files.length >= 50) break;
			}
			return files.map((f) => {
				const insert = this.app.metadataCache.fileToLinktext(f, this.sourcePath, true);
				return {insert, label: f.basename, detail: f.path};
			});
		}

		const keyLower = this.getRowKey().trim().toLowerCase();
		const tagCtx = partialTagNeedle(query);
		if (tagCtx && (keyLower === "tags" || query.includes("#"))) {
			const ql = tagCtx.needle.toLowerCase();
			return tagNamesFromVault(this.app)
				.filter((t) => !ql || t.toLowerCase().includes(ql))
				.slice(0, 45)
				.map((t) => ({insert: t, label: `#${t}`, detail: "Tag"}));
		}

		const propKey = this.getRowKey().trim();
		if (!propKey) return [];
		return gatherValueHistoryForKey(this.app, propKey, query).map((h) => ({
			insert: h,
			label: h,
			detail: "Used in vault",
		}));
	}

	renderSuggestion(item: PropertyValueSuggestItem, el: HTMLElement): void {
		el.createDiv({text: item.label, cls: "orbit-person-props-suggest__label"});
		if (item.detail) {
			el.createDiv({
				text: item.detail,
				cls: "orbit-person-props-suggest__detail",
			});
		}
	}

	selectSuggestion(item: PropertyValueSuggestItem, evt: MouseEvent | KeyboardEvent): void {
		void evt;
		const q = this.getValue();
		const w = partialWikilinkNeedle(q);
		if (w) {
			const prefix = q.slice(0, w.replaceStart);
			const suffix = q.slice(w.replaceEnd);
			this.setValue(prefix + item.insert + "]]" + suffix);
			return;
		}
		const tag = partialTagNeedle(q);
		if (tag) {
			const before = q.slice(0, tag.hashIdx);
			const after = q.slice(tag.hashIdx + 1 + tag.needle.length);
			const t = item.insert.replace(/^#/, "");
			this.setValue(`${before}#${t}${after}`);
			return;
		}
		this.setValue(item.insert);
	}
}
