import {App, Modal, Notice, Setting, TFile} from "obsidian";
import {
	gatherAllPropertyKeys,
	PersonPropertyValueSuggest,
	PropertyKeySuggest,
} from "./notePropertySuggests";

function fmValueToEditString(v: unknown): string {
	if (v == null) return "";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (Array.isArray(v)) {
		return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
	}
	if (typeof v === "object") return JSON.stringify(v);
	return String(v);
}

type RowModel = {
	key: string;
	valueStr: string;
	original: unknown;
};

function coerceRowValue(key: string, valueStr: string, original: unknown): unknown {
	const t = valueStr.trim();
	if (t === "") return undefined;
	const kl = key.trim().toLowerCase();

	if (original !== undefined && original !== null) {
		if (Array.isArray(original)) {
			return t
				.split(/[,\n]/)
				.map((s) => s.trim().replace(/^#/, ""))
				.filter((s) => s.length > 0);
		}
		if (typeof original === "number") {
			const n = Number(t);
			return Number.isFinite(n) ? n : t;
		}
		if (typeof original === "boolean" && /^(true|false)$/i.test(t)) {
			return t.toLowerCase() === "true";
		}
		if (typeof original === "object" && !Array.isArray(original)) {
			try {
				return JSON.parse(t);
			} catch {
				return t;
			}
		}
	}

	if (kl === "tags" && (t.includes(",") || t.includes("\n"))) {
		return t
			.split(/[,\n]/)
			.map((s) => s.trim().replace(/^#/, ""))
			.filter((s) => s.length > 0);
	}
	if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
	if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
		try {
			return JSON.parse(t);
		} catch {
			/* fall through */
		}
	}
	return t;
}

export type NotePropertiesModalOptions = {
	/** Permanently remove this note (host typically closes this modal first, then opens confirm). */
	onDeletePage?: () => void;
	/**
	 * When set, a “Display title” editor appears above the property grid and edits this YAML key.
	 * That key is omitted from the generic rows to avoid duplicates (e.g. Fulcrum `entry` field).
	 */
	displayTitleField?: string;
};

/** Edit YAML properties with Orbit-style UI (shared with Fulcrum companion chrome). */
export class NotePropertiesModal extends Modal {
	private readonly file: TFile;
	private readonly opts: NotePropertiesModalOptions | undefined;
	private rowsHost!: HTMLElement;
	private suggestCloseables: {close: () => void}[] = [];
	private displayTitleInputEl: HTMLInputElement | null = null;

	constructor(app: App, file: TFile, opts?: NotePropertiesModalOptions) {
		super(app);
		this.file = file;
		this.opts = opts;
	}

	override onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass("orbit-person-props");
		this.titleEl.setText(`Properties — ${this.file.basename.replace(/\.md$/i, "")}`);

		const fm = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
		const titleFieldLc = this.opts?.displayTitleField?.trim().toLowerCase() ?? "";

		let rowData: RowModel[] =
			fm && typeof fm === "object"
				? Object.entries(fm).map(([key, val]) => ({
						key,
						valueStr: fmValueToEditString(val),
						original: val,
					}))
				: [{key: "", valueStr: "", original: undefined}];

		if (titleFieldLc) {
			rowData = rowData.filter((r) => r.key.trim().toLowerCase() !== titleFieldLc);
		}
		if (rowData.length === 0) {
			rowData.push({key: "", valueStr: "", original: undefined});
		}

		const displayKey = this.opts?.displayTitleField?.trim();
		if (displayKey) {
			const curTitle =
				fm && typeof fm === "object" ? fmValueToEditString((fm as Record<string, unknown>)[displayKey]) : "";
			new Setting(contentEl)
				.setName("Display title")
				.setDesc(`Shown in the note header companion. Saved as frontmatter \`${displayKey}\`. Filename is unchanged.`)
				.addText((t) => {
					t.inputEl.addClass("orbit-person-props__display-title");
					this.displayTitleInputEl = t.inputEl;
					t.setValue(curTitle);
				});
		}

		const allKeys = gatherAllPropertyKeys(this.app);
		const scroll = contentEl.createDiv({cls: "orbit-person-props__scroll"});
		this.rowsHost = scroll.createDiv({cls: "orbit-person-props__rows"});
		for (const r of rowData) {
			this.addRowUi(r, allKeys);
		}

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Add property").onClick(() => {
				this.addRowUi({key: "", valueStr: "", original: undefined}, allKeys);
			}),
		);

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						void this.save();
					}),
			);

		if (this.opts?.onDeletePage) {
			contentEl.createEl("hr", {cls: "orbit-person-props__hr"});
			new Setting(contentEl)
				.setName("Delete page")
				.setDesc("Remove this file from the vault permanently (not the Obsidian trash).")
				.addButton((b) =>
					b
						.setButtonText("Delete page…")
						.setWarning()
						.onClick(() => this.opts!.onDeletePage!()),
				);
		}
	}

	private addRowUi(initial: RowModel, allKeys: string[]): void {
		const row = this.rowsHost.createDiv({cls: "orbit-person-props__row"});
		const keyInput = row.createEl("input", {
			type: "text",
			attr: {placeholder: "Property"},
			cls: "orbit-person-props__key input-reset",
		});
		keyInput.value = initial.key;
		const valInput = row.createEl("input", {
			type: "text",
			attr: {placeholder: "Value"},
			cls: "orbit-person-props__val input-reset",
		});
		valInput.value = initial.valueStr;

		const keySug = new PropertyKeySuggest(this.app, keyInput, allKeys);
		this.registerSuggester(keySug);
		const valSug = new PersonPropertyValueSuggest(this.app, valInput, this.file.path, () => keyInput.value);
		this.registerSuggester(valSug);

		row.createEl("button", {
			type: "button",
			text: "✕",
			cls: "orbit-person-props__remove",
			attr: {"aria-label": "Remove property"},
		}).addEventListener("click", () => {
			keySug.close();
			valSug.close();
			row.remove();
		});
	}

	private registerSuggester(c: {close: () => void}): void {
		this.suggestCloseables.push(c);
	}

	private readRowsFromDom(): RowModel[] {
		const out: RowModel[] = [];
		for (const row of Array.from(this.rowsHost.querySelectorAll<HTMLElement>(".orbit-person-props__row"))) {
			const keyIn = row.querySelector(".orbit-person-props__key") as HTMLInputElement | null;
			const valIn = row.querySelector(".orbit-person-props__val") as HTMLInputElement | null;
			if (!keyIn || !valIn) continue;
			const key = keyIn.value.trim();
			if (!key && !valIn.value.trim()) continue;
			if (!key && valIn.value.trim()) continue;
			out.push({key, valueStr: valIn.value, original: undefined});
		}
		return out;
	}

	private async save(): Promise<void> {
		const fm0 = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
		const origByKey =
			fm0 && typeof fm0 === "object"
				? new Map<string, unknown>(Object.entries(fm0).map(([k, v]) => [k, v]))
				: new Map<string, unknown>();

		const domRows = this.readRowsFromDom();
		const byKey = new Map<string, RowModel>();
		for (const r of domRows) {
			const k = r.key.trim();
			if (!k) continue;
			byKey.set(k, {...r, original: origByKey.get(k)});
		}

		const edits = [...byKey.values()];
		const seen = new Set<string>();
		for (const r of edits) {
			const k = r.key.trim();
			if (seen.has(k)) {
				new Notice("Duplicate property name — merge rows before saving.");
				return;
			}
			seen.add(k);
		}

		const newFm: Record<string, unknown> = {};
		for (const r of edits) {
			const k = r.key.trim();
			const v = coerceRowValue(k, r.valueStr, r.original);
			if (v !== undefined) newFm[k] = v;
		}

		const dtKey = this.opts?.displayTitleField?.trim();
		if (dtKey && this.displayTitleInputEl) {
			const raw = this.displayTitleInputEl.value.trim();
			if (raw) newFm[dtKey] = raw;
			else delete newFm[dtKey];
		}

		try {
			await this.app.fileManager.processFrontMatter(this.file, (fm) => {
				for (const k of Object.keys(fm)) {
					if (!(k in newFm)) delete fm[k];
				}
				for (const [k, v] of Object.entries(newFm)) {
					fm[k] = v;
				}
			});
			new Notice("Properties saved.");
			this.close();
		} catch (e) {
			console.error(e);
			new Notice("Could not save properties — check YAML syntax.");
		}
	}

	override onClose(): void {
		this.displayTitleInputEl = null;
		for (const c of this.suggestCloseables) {
			try {
				c.close();
			} catch {
				/* noop */
			}
		}
		this.suggestCloseables = [];
		this.contentEl.empty();
	}
}

/**
 * Preferred entry for Orbit, Fulcrum, and other suite UIs so options stay consistent.
 * @returns The modal instance (already opened), e.g. so hosts can close it from callbacks.
 */
export function openNotePropertiesModal(
	app: App,
	file: TFile,
	opts?: NotePropertiesModalOptions,
): NotePropertiesModal {
	const m = new NotePropertiesModal(app, file, opts);
	m.open();
	return m;
}
