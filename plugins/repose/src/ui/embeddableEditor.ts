/**
 * Embeddable Markdown Editor — Obsidian’s source editor (wiki links, tags, etc.) in a container.
 * Adapted from Fulcrum / https://gist.github.com/Fevol/caa478ce303e69eabede7b12b2323838 (MIT).
 */

import type {App, TFile, WorkspaceLeaf} from "obsidian";
import {Scope} from "obsidian";
import {EditorView, keymap, placeholder as cmPlaceholder} from "@codemirror/view";
import {Prec} from "@codemirror/state";
import {around} from "monkey-around";

function resolveEditorBase(
	app: App,
): new (app: App, container: HTMLElement, owner: object) => EmbeddableEditorBase {
	const embedRegistry = (
		app as {
			embedRegistry?: {
				embedByExtension?: Record<string, (info: unknown, file: TFile, content: string) => unknown>;
			};
		}
	).embedRegistry;
	const embedFn = embedRegistry?.embedByExtension?.md;
	if (!embedFn) {
		throw new Error("Repose: embedRegistry.embedByExtension.md not available");
	}
	const widgetEditorView = embedFn.call(
		embedRegistry,
		{app, containerEl: document.createElement("div")},
		null as unknown as TFile,
		"",
	) as {
		editable: boolean;
		editMode: {constructor: new (a: App, c: HTMLElement, o: object) => EmbeddableEditorBase} | null;
		showEditor(): void;
		unload(): void;
	};
	if (!widgetEditorView?.editMode) {
		throw new Error("Repose: could not resolve embeddable editor prototype");
	}
	widgetEditorView.editable = true;
	widgetEditorView.showEditor();
	const MarkdownEditor = Object.getPrototypeOf(Object.getPrototypeOf(widgetEditorView.editMode));
	widgetEditorView.unload();
	return MarkdownEditor.constructor as new (app: App, container: HTMLElement, owner: object) => EmbeddableEditorBase;
}

interface EmbeddableEditorBase {
	set(v: string): void;
	editor?: {cm?: EditorView};
	editorEl?: HTMLElement;
	_loaded?: boolean;
	unload?(): void;
	destroy?(): void;
	buildLocalExtensions?(): unknown[];
	onUpdate?(update: {docChanged: boolean}, changed: boolean): void;
}

export interface EmbeddableEditorOptions {
	value?: string;
	placeholder?: string;
	cls?: string;
	onChange?: (value: string) => void;
	onSubmit?: (value: string) => void;
}

export interface EmbeddableEditorHandle {
	getValue(): string;
	setValue(value: string): void;
	destroy(): void;
}

const editorBaseCache = new WeakMap<App, new (app: App, container: HTMLElement, owner: object) => EmbeddableEditorBase>();

export function createEmbeddableEditor(
	app: App,
	container: HTMLElement,
	options: EmbeddableEditorOptions = {},
): EmbeddableEditorHandle {
	const Base =
		editorBaseCache.get(app) ??
		(() => {
			const C = resolveEditorBase(app);
			editorBaseCache.set(app, C);
			return C;
		})();

	const owner: {
		app: App;
		onMarkdownScroll: () => void;
		getMode: () => "source";
		editMode?: EmbeddableEditorBase;
		editor?: {cm?: EditorView};
	} = {
		app,
		onMarkdownScroll: () => {},
		getMode: () => "source",
	};

	let workspaceUnpatch: () => void = () => {};

	class EmbeddableEditor extends Base {
		declare scope: Scope;
		declare options: EmbeddableEditorOptions;

		constructor(appInner: App, containerEl: HTMLElement, ownerParam: object) {
			super(appInner, containerEl, ownerParam);
			this.scope = new Scope(appInner.scope);
			this.options = options;

			(ownerParam as typeof owner).editMode = this;
			(ownerParam as typeof owner).editor = this.editor;

			workspaceUnpatch = around(
				appInner.workspace as {setActiveLeaf?: (l: WorkspaceLeaf, p?: {focus?: boolean}) => void},
				{
					setActiveLeaf:
						(next: ((l: WorkspaceLeaf, p?: {focus?: boolean}) => void) | undefined) =>
						(leaf: WorkspaceLeaf, params?: {focus?: boolean}) => {
							if ((this.editor?.cm as {hasFocus?: boolean})?.hasFocus) return;
							next?.call(appInner.workspace, leaf, params);
						},
				},
			);

			const cm = this.editor?.cm as EditorView | undefined;
			const focusEl = cm?.contentDOM ?? (cm as {dom?: HTMLElement})?.dom;
			if (focusEl) {
				focusEl.addEventListener("focusin", () => {
					appInner.keymap.pushScope(this.scope);
					appInner.workspace.activeEditor = ownerParam as never;
				});
				focusEl.addEventListener("blur", () => {
					appInner.keymap.popScope(this.scope);
				});
			}

			this.set(options.value ?? "");
			if (options.cls && this.editorEl) this.editorEl.classList.add(options.cls);
		}

		onUpdate(update: {docChanged: boolean}, changed: boolean): void {
			super.onUpdate?.(update, changed);
			if (changed) options.onChange?.(this.getValue());
		}

		buildLocalExtensions(): unknown[] {
			const extensions = super.buildLocalExtensions?.() ?? [];
			if (options.placeholder) extensions.push(cmPlaceholder(options.placeholder));
			extensions.push(
				Prec.highest(
					keymap.of([
						{
							key: "Mod-Enter",
							run: () => {
								options.onSubmit?.(this.getValue());
								return true;
							},
						},
					]),
				),
			);
			return extensions;
		}

		getValue(): string {
			return this.editor?.cm?.state?.doc?.toString?.() ?? "";
		}

		destroy(): void {
			workspaceUnpatch();
			app.keymap.popScope(this.scope);
			app.workspace.activeEditor = null;
			if (this._loaded) this.unload?.();
			container.empty();
			super.destroy?.();
		}
	}

	const editor = new EmbeddableEditor(app, container, owner) as EmbeddableEditorBase & {
		getValue(): string;
		destroy(): void;
	};

	return {
		getValue: () => editor.getValue(),
		setValue: (v: string) => editor.set?.(v),
		destroy: () => editor.destroy?.(),
	};
}
