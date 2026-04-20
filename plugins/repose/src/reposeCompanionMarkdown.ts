import { MarkdownView, Platform, type App, TFile, type WorkspaceLeaf } from "obsidian";
import type ReposePlugin from "./main";
import { resolveMediaTypeForFile } from "./media/mediaDetect";
import { leafIsInSideDock, leafIsInWorkspace } from "./workspaceLeaf";
import ReposeMarkdownChrome from "./svelte/ReposeMarkdownChrome.svelte";

const DOC_CLASS = "repose-companion-doc";

type ChromeMount = { $destroy(): void; $set(props: Record<string, unknown>): void };

const chromeByView = new WeakMap<MarkdownView, ChromeMount>();

let syncTimer: number | undefined;

function clearTintOnEl(el: HTMLElement): void {
	el.removeAttribute("data-repose-tint");
	for (const k of ["--repose-sample-r", "--repose-sample-g", "--repose-sample-b"] as const) {
		el.style.removeProperty(k);
	}
}

function scheduleSyncAllMarkdownChrome(plugin: ReposePlugin): void {
	window.clearTimeout(syncTimer);
	syncTimer = window.setTimeout(() => {
		syncTimer = undefined;
		syncAllMarkdownChrome(plugin);
	}, 80);
}

/**
 * Prefer a main-area leaf so docked Repose doesn’t force a new empty tab. Reuse an existing markdown leaf when
 * the active leaf is still the dock (common right after clicking the list).
 */
function leafForBookNote(app: App, anchorLeaf: WorkspaceLeaf): WorkspaceLeaf {
	if (!leafIsInSideDock(app, anchorLeaf)) {
		return anchorLeaf;
	}
	const active = app.workspace.activeLeaf;
	if (active && !leafIsInSideDock(app, active)) {
		return active;
	}
	let mainMarkdown: WorkspaceLeaf | null = null;
	app.workspace.iterateAllLeaves((l) => {
		if (leafIsInSideDock(app, l)) return;
		if (l.view.getViewType() === "markdown" && !mainMarkdown) mainMarkdown = l;
	});
	if (mainMarkdown) return mainMarkdown;
	return app.workspace.getLeaf("tab");
}

/**
 * Books: single markdown leaf with hero chrome (no split). Replaces main Repose when Repose is the anchor leaf;
 * when Repose is in a dock, opens/focuses the book in the main workspace without also opening Repose there.
 */
export async function openBookCompanionSinglePane(
	plugin: ReposePlugin,
	anchorLeaf: WorkspaceLeaf,
	file: TFile,
): Promise<void> {
	const app = plugin.app;
	plugin.reposeCompanionMarkdownOwnedSplit = false;
	plugin.reposeCompanionMarkdownPath = file.path;

	const target = leafForBookNote(app, anchorLeaf);
	await target.openFile(file, { active: true });
	plugin.reposeCompanionMarkdownLeaf = target;
	scheduleSyncAllMarkdownChrome(plugin);
}

/**
 * Episode notes: open a Markdown leaf beside Repose (split, Fulcrum-style); prepended chrome (see
 * {@link syncAllMarkdownChrome}) matches the in-app hero. YAML / Properties stay in the file but are hidden via
 * {@link DOC_CLASS}.
 */
export async function ensureReposeCompanionMarkdownPane(
	plugin: ReposePlugin,
	anchorLeaf: WorkspaceLeaf,
	file: TFile,
): Promise<void> {
	const app = plugin.app;
	plugin.reposeCompanionMarkdownOwnedSplit = true;
	plugin.reposeCompanionMarkdownPath = file.path;

	let anchor = anchorLeaf;
	if (leafIsInSideDock(app, anchorLeaf)) {
		anchor = app.workspace.getLeaf("tab");
	}

	const reuse =
		plugin.reposeCompanionMarkdownLeaf &&
		leafIsInWorkspace(app, plugin.reposeCompanionMarkdownLeaf) &&
		plugin.reposeCompanionMarkdownLeaf !== anchor;

	if (Platform.isMobile) {
		const leaf = app.workspace.getLeaf("tab");
		await leaf.openFile(file, { active: true });
		plugin.reposeCompanionMarkdownLeaf = leaf;
		scheduleSyncAllMarkdownChrome(plugin);
		return;
	}

	if (reuse) {
		await app.workspace.revealLeaf(plugin.reposeCompanionMarkdownLeaf!);
		await plugin.reposeCompanionMarkdownLeaf!.openFile(file, { active: true });
		scheduleSyncAllMarkdownChrome(plugin);
		return;
	}

	const splitLeaf = app.workspace.createLeafBySplit(anchor, "vertical", false);
	await splitLeaf.openFile(file, { active: true });
	plugin.reposeCompanionMarkdownLeaf = splitLeaf;
	await app.workspace.revealLeaf(splitLeaf);
	scheduleSyncAllMarkdownChrome(plugin);
}

export function clearReposeCompanionMarkdownPane(plugin: ReposePlugin): void {
	const leaf = plugin.reposeCompanionMarkdownLeaf;
	const owned = plugin.reposeCompanionMarkdownOwnedSplit;
	if (owned && leaf && leafIsInWorkspace(plugin.app, leaf)) {
		const v = leaf.view;
		if (v instanceof MarkdownView) {
			clearChromeForMarkdownView(v);
		}
		try {
			leaf.detach();
		} catch {
			/* ignore */
		}
	}
	plugin.reposeCompanionMarkdownLeaf = null;
	plugin.reposeCompanionMarkdownPath = null;
	plugin.reposeCompanionMarkdownOwnedSplit = false;
}

function clearChromeForMarkdownView(view: MarkdownView): void {
	view.containerEl.classList.remove(DOC_CLASS);
	clearTintOnEl(view.containerEl);
	const comp = chromeByView.get(view);
	if (comp) {
		comp.$destroy();
		chromeByView.delete(view);
	}
	view.contentEl.querySelector(":scope > .repose-companion-chrome-host")?.remove();
}

export function syncAllMarkdownChrome(plugin: ReposePlugin): void {
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const v = leaf.view;
		if (!(v instanceof MarkdownView) || !v.file) return;
		syncChromeForMarkdownView(plugin, v);
	});
}

function syncChromeForMarkdownView(plugin: ReposePlugin, view: MarkdownView): void {
	const file = view.file;
	if (!file) {
		clearChromeForMarkdownView(view);
		return;
	}
	const mt = resolveMediaTypeForFile(plugin.app, file, plugin.settings);
	if (mt !== "book" && mt !== "episode") {
		clearChromeForMarkdownView(view);
		return;
	}

	/* Class on container so tint + YAML hiding apply to the full leaf (view-content sits here, not on contentEl). */
	view.containerEl.classList.add(DOC_CLASS);

	let host = view.contentEl.querySelector(":scope > .repose-companion-chrome-host") as HTMLElement | null;
	if (!host) {
		host = document.createElement("div");
		host.className = "repose-companion-chrome-host";
		view.contentEl.prepend(host);
	}

	const existing = chromeByView.get(view);
	if (existing) {
		existing.$set({ file, tintRootEl: view.containerEl });
		return;
	}

	const comp = new ReposeMarkdownChrome({
		target: host,
		props: { plugin, file, tintRootEl: view.containerEl },
	});
	chromeByView.set(view, comp);
}

export function registerReposeCompanionMarkdown(plugin: ReposePlugin): void {
	const run = (): void => scheduleSyncAllMarkdownChrome(plugin);
	plugin.registerEvent(plugin.app.workspace.on("layout-change", run));
	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", run));
	plugin.registerEvent(plugin.app.workspace.on("file-open", run));
	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (f) => {
			if (f instanceof TFile) run();
		}),
	);
}

export async function syncReposeCompanionPaneForSelection(
	plugin: ReposePlugin,
	anchorLeaf: WorkspaceLeaf,
	file: TFile | null,
): Promise<void> {
	if (!file) {
		clearReposeCompanionMarkdownPane(plugin);
		return;
	}
	const mt = resolveMediaTypeForFile(plugin.app, file, plugin.settings);
	if (mt === "book") {
		await openBookCompanionSinglePane(plugin, anchorLeaf, file);
		return;
	}
	if (mt === "episode") {
		await ensureReposeCompanionMarkdownPane(plugin, anchorLeaf, file);
		return;
	}
	clearReposeCompanionMarkdownPane(plugin);
}
