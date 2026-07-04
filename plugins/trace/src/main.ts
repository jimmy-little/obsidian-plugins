import { MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { traceEditorExtension } from "./highlight/cmExtension";
import { tracePostProcessor } from "./highlight/postProcessor";
import { applyVisibilityToDom, createFilterToolbar } from "./filter/filterToolbar";
import { detectAndParse } from "./parser";
import { registerTraceBlock } from "./query/traceBlock";
import { applyTokenColorCss, DEFAULT_SETTINGS } from "./settings/defaults";
import { TraceSettingTab } from "./settings/settingsTab";
import { isTraceFile, resolveLogFormat, resolveTraceColumns } from "./traceContext";
import type { LogEntry, TraceSettings } from "./types";

interface FilterMount {
	toolbar: ReturnType<typeof createFilterToolbar>;
	container: HTMLElement;
}

export default class TracePlugin extends Plugin {
	settings: TraceSettings = { ...DEFAULT_SETTINGS, tokenColors: { ...DEFAULT_SETTINGS.tokenColors } };

	private containerEntries = new WeakMap<HTMLElement, LogEntry[]>();
	private viewEntries = new WeakMap<EditorView, LogEntry[]>();
	private filterMounts = new Map<string, FilterMount>();
	private filterRefreshCallbacks = new Set<() => void>();

	async onload(): Promise<void> {
		await this.loadSettings();
		applyTokenColorCss(this.settings);

		this.registerEditorExtension(traceEditorExtension(this));
		this.registerMarkdownPostProcessor(tracePostProcessor(this));
		registerTraceBlock(this);

		this.addSettingTab(new TraceSettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncFilterToolbar()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.syncFilterToolbar()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.syncFilterToolbar()));
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile && isTraceFile(file, this.app.metadataCache.getFileCache(file))) {
					this.syncFilterToolbar();
				}
			}),
		);

		this.syncFilterToolbar();
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<TraceSettings> | null;
		if (data) {
			this.settings = {
				...DEFAULT_SETTINGS,
				...data,
				columnAliases: { ...DEFAULT_SETTINGS.columnAliases, ...data.columnAliases },
				tokenColors: { ...DEFAULT_SETTINGS.tokenColors, ...data.tokenColors },
				customStatusMappings: { ...data.customStatusMappings },
			};
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getActiveTraceFile(view?: EditorView): TFile | null {
		if (view) {
			const leaf = this.findLeafForEditorView(view);
			if (leaf?.view instanceof MarkdownView && leaf.view.file) return leaf.view.file;
		}
		const leaf = this.app.workspace.activeLeaf;
		if (leaf?.view instanceof MarkdownView && leaf.view.file) {
			const cache = this.app.metadataCache.getFileCache(leaf.view.file);
			if (isTraceFile(leaf.view.file, cache)) return leaf.view.file;
		}
		const active = this.app.workspace.getActiveFile();
		if (active) {
			const cache = this.app.metadataCache.getFileCache(active);
			if (isTraceFile(active, cache)) return active;
		}
		return null;
	}

	private findLeafForEditorView(view: EditorView): WorkspaceLeaf | null {
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			if (leaf.view instanceof MarkdownView) {
				const cm = (leaf.view as MarkdownView & { editor?: { cm?: EditorView } }).editor?.cm;
				if (cm === view) return leaf;
			}
		}
		return null;
	}

	setViewEntries(view: EditorView, entries: LogEntry[]): void {
		this.viewEntries.set(view, entries);
	}

	setContainerEntries(container: HTMLElement, entries: LogEntry[]): void {
		this.containerEntries.set(container, entries);
	}

	requestFilterRefresh(): void {
		for (const cb of this.filterRefreshCallbacks) cb();
	}

	mountFilterForElement(container: HTMLElement, entries: LogEntry[], filePath: string): void {
		this.unmountFilter(filePath);
		const mountPoint = container.closest(".markdown-source-view, .markdown-preview-view, .view-content")
			?? container.parentElement
			?? container;

		const parent = mountPoint.parentElement ?? mountPoint;
		const toolbar = createFilterToolbar(entries, (visible) => {
			applyVisibilityToDom(container, visible);
			const sourceView = container.closest(".markdown-source-view");
			if (sourceView) applyVisibilityToDom(sourceView as HTMLElement, visible);
		});

		parent.insertBefore(toolbar.root, mountPoint);
		this.filterMounts.set(filePath, { toolbar, container });
	}

	private unmountFilter(filePath: string): void {
		const existing = this.filterMounts.get(filePath);
		if (existing) {
			existing.toolbar.destroy();
			this.filterMounts.delete(filePath);
		}
	}

	private async syncFilterToolbar(): Promise<void> {
		const activePath = this.app.workspace.getActiveFile()?.path;
		for (const [path, mount] of this.filterMounts.entries()) {
			if (path !== activePath) {
				mount.toolbar.destroy();
				this.filterMounts.delete(path);
			}
		}

		const leaf = this.app.workspace.activeLeaf;
		if (!leaf) return;

		const view = leaf.view;
		if (view instanceof MarkdownView && view.file) {
			const file = view.file;
			const cache = this.app.metadataCache.getFileCache(file);
			if (!isTraceFile(file, cache)) return;
			if (this.filterMounts.has(file.path)) return;

			try {
				const content = await this.app.vault.read(file);
				const format = resolveLogFormat(content, cache, file.extension);
				const parsed = detectAndParse(
					content,
					{
						format,
						columnMapping: resolveTraceColumns(cache),
						csvDelimiter: this.settings.csvDelimiter,
						customStatusMappings: this.settings.customStatusMappings,
					},
					this.settings,
				);
				const container = view.containerEl;
				this.mountFilterForElement(container, parsed.entries, file.path);
			} catch (err) {
				console.error("Trace: failed to mount filter toolbar", err);
			}
		}
	}
}
