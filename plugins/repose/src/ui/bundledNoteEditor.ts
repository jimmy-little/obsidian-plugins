import { Component, TFile } from "obsidian";
import matter from "gray-matter";
import type ReposePlugin from "../main";
import { createEmbeddableEditor, type EmbeddableEditorHandle } from "./embeddableEditor";

/**
 * When the next line after opening `---` is exactly `---`, returns body after closing fence.
 * Matches Obsidian frontmatter boundaries; avoids gray-matter occasionally returning an empty body
 * for valid Readwise / Kindle YAML.
 */
function splitBodyAfterFrontmatter(src: string): string | null {
	const s = src.replace(/^\uFEFF/, "");
	if (!s.startsWith("---")) return null;
	const lines = s.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return null;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			return lines.slice(i + 1).join("\n");
		}
	}
	return null;
}

function extractNoteBodyMarkdown(raw: string): string {
	const normalized = raw.replace(/^\uFEFF/, "");
	const parsed = matter(normalized);
	const fromMatter = typeof parsed.content === "string" ? parsed.content : "";
	if (fromMatter.trim() !== "") return fromMatter;
	const manual = splitBodyAfterFrontmatter(normalized);
	return manual ?? fromMatter;
}

/** Editable markdown body for a bundle note (below hero); syncs YAML + body via gray-matter. */
export class BundledNoteEditorHost extends Component {
	private handle: EmbeddableEditorHandle | null = null;
	private saveTimer: number | null = null;
	private lastWritten = "";
	private saving = false;

	constructor(
		private plugin: ReposePlugin,
		private container: HTMLElement,
		private file: TFile,
	) {
		super();
	}

	onload(): void {
		void this.bootstrap();
		this.registerEvent(
			this.plugin.app.vault.on("modify", (f) => {
				if (f.path !== this.file.path) return;
				void this.onFileModifiedElsewhere();
			}),
		);
	}

	private async bootstrap(): Promise<void> {
		const raw = await this.plugin.app.vault.read(this.file);
		const body = extractNoteBodyMarkdown(raw);
		this.lastWritten = body;
		this.container.empty();
		this.handle = createEmbeddableEditor(this.plugin.app, this.container, {
			value: body,
			cls: "repose-bundled-note-cm",
			onChange: (v) => this.scheduleSave(v),
		});
	}

	private scheduleSave(body: string): void {
		if (this.saveTimer != null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.persistBody(body), 450);
	}

	private async persistBody(body: string): Promise<void> {
		this.saveTimer = null;
		if (body === this.lastWritten) return;
		this.saving = true;
		try {
			const raw = await this.plugin.app.vault.read(this.file);
			const parsed = matter(raw);
			const next = body.endsWith("\n") ? body : `${body}\n`;
			const out = matter.stringify(next, parsed.data as Record<string, unknown>);
			await this.plugin.app.vault.modify(this.file, out);
			this.lastWritten = body;
		} finally {
			this.saving = false;
		}
	}

	private async onFileModifiedElsewhere(): Promise<void> {
		if (this.saving) return;
		const root = this.container.closest(".repose-bundle-note-editor");
		if (root?.contains(document.activeElement)) return;
		const raw = await this.plugin.app.vault.read(this.file);
		const body = extractNoteBodyMarkdown(raw);
		if (body === this.handle?.getValue()) return;
		this.lastWritten = body;
		this.handle?.setValue(body);
	}

	onunload(): void {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		const h = this.handle;
		if (h) {
			const v = h.getValue();
			if (v !== this.lastWritten) {
				void this.persistBodyImmediate(v);
			}
			h.destroy();
		}
		this.handle = null;
	}

	private async persistBodyImmediate(body: string): Promise<void> {
		this.saving = true;
		try {
			const raw = await this.plugin.app.vault.read(this.file);
			const parsed = matter(raw);
			const next = body.endsWith("\n") ? body : `${body}\n`;
			const out = matter.stringify(next, parsed.data as Record<string, unknown>);
			await this.plugin.app.vault.modify(this.file, out);
			this.lastWritten = body;
		} finally {
			this.saving = false;
		}
	}
}
