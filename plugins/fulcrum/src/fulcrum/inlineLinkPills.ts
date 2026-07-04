import {MarkdownView, normalizePath, setIcon, type App, type Plugin, TFile} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {resolveProjectsRoot} from "./settingsDefaults";
import type {IndexedProject} from "./types";
import type {VaultIndex} from "./VaultIndex";
import {
	buildPeopleDirsMatchIndex,
	personFileMatchKeys,
	resolvePeopleFolderNote,
} from "./projectPeople";
import {isFileInPeopleDirs} from "./people/pathUtils";
import {isUnderFolder} from "./utils/paths";
import {resolveBannerImageSrc, resolveProjectAccentCss} from "./utils/projectVisual";

const PERSON_PILL_ATTR = "data-fulcrum-person-pill";
const PROJECT_PILL_ATTR = "data-fulcrum-project-pill";
const PRODUCT_PILL_ATTR = "data-fulcrum-product-pill";
const COVER_FM_KEY = "cover";

type PillKind = "person" | "project" | "product";

const PILL_CLASS: Record<PillKind, string> = {
	person: "fulcrum-person-inline-pill",
	project: "fulcrum-project-inline-pill",
	product: "fulcrum-product-inline-pill",
};

const PILL_ATTR: Record<PillKind, string> = {
	person: PERSON_PILL_ATTR,
	project: PROJECT_PILL_ATTR,
	product: PRODUCT_PILL_ATTR,
};

const FALLBACK_ICON: Record<PillKind, string> = {
	person: "user",
	project: "folder",
	product: "app-window",
};

const SKIP_LINK_HOST_SELECTOR =
	"pre, code, li.task-list-item, .metadata-container, .metadata-properties, .metadata-property, .frontmatter-section, .frontmatter-container";

function skipLinkHost(el: HTMLElement): boolean {
	return !!el.closest(SKIP_LINK_HOST_SELECTOR);
}

function stripWikiLinkText(raw: string): string {
	const t = raw.trim();
	const m = t.match(/\[\[([^\]]+)\]\]/);
	if (m) {
		const inner = m[1]!;
		const pipe = inner.indexOf("|");
		return (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
	}
	return t.replace(/^\[\[|\]\]$/g, "").trim();
}

function linkpathFromInternalLinkEl(el: HTMLElement): string {
	const dataHref =
		el.getAttribute("data-href")?.trim() ||
		el.dataset.href?.trim() ||
		el.getAttribute("data-link-path")?.trim() ||
		el.dataset.linkDataHref?.trim();
	if (dataHref && !/^https?:\/\//i.test(dataHref) && !/^mailto:/i.test(dataHref)) {
		return dataHref.replace(/^#/, "").trim();
	}
	if (el instanceof HTMLAnchorElement) {
		const href = el.getAttribute("href")?.trim();
		if (href && !/^https?:\/\//i.test(href) && !/^mailto:/i.test(href) && href !== "#") {
			return href.replace(/^#/, "").trim();
		}
	}
	return "";
}

function collectInternalLinkNodes(root: HTMLElement): HTMLElement[] {
	const seen = new Set<HTMLElement>();
	const selectors = ["a.internal-link", "a[data-href]", "span.cm-hmd-internal-link"];
	for (const sel of selectors) {
		for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
			seen.add(el);
		}
	}
	return [...seen];
}

function applyPillLinkTarget(app: App, node: HTMLElement, dest: TFile, sourcePath: string): void {
	const linktext =
		app.metadataCache.fileToLinktext(dest, sourcePath, true) ?? dest.basename.replace(/\.md$/i, "");
	node.setAttribute("data-href", linktext);
	if (node instanceof HTMLAnchorElement) {
		node.setAttribute("href", linktext);
	}
	node.classList.add("internal-link");
}

function resolveDestFile(app: App, linktext: string, sourcePath: string): TFile | null {
	const trimmed = linktext.trim();
	if (!trimmed) return null;
	const dest =
		app.metadataCache.getFirstLinkpathDest(trimmed, sourcePath) ??
		app.metadataCache.getFirstLinkpathDest(trimmed, "");
	return dest instanceof TFile ? dest : null;
}

function resolveCoverSrc(app: App, file: TFile): string | null {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
	const raw = fm?.[COVER_FM_KEY];
	if (typeof raw !== "string" || !raw.trim()) return null;
	return resolveBannerImageSrc(app, file, raw);
}

function displayNameFromFile(app: App, file: TFile): string {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
	if (typeof fm?.name === "string" && fm.name.trim()) return fm.name.trim();
	return file.basename.replace(/\.md$/i, "");
}

function resolveNoteColorCss(
	app: App,
	file: TFile,
	colorField: string,
): string | undefined {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
	const key = colorField.trim() || "color";
	const raw = fm?.[key];
	if (typeof raw !== "string" || !raw.trim()) return undefined;
	return resolveProjectAccentCss(raw);
}

function applyPillAccentTint(node: HTMLElement, accentCss: string): void {
	node.style.setProperty("--fulcrum-inline-pill-accent", accentCss);
	node.classList.add("fulcrum-inline-pill--accent");
}

export interface InlineLinkFolderIndexes {
	people: Map<string, TFile>;
	products: Map<string, TFile>;
}

interface FolderIndexCacheEntry {
	peopleDirsKey: string;
	productsFolder: string;
	indexes: InlineLinkFolderIndexes;
}

let folderIndexCache: FolderIndexCacheEntry | null = null;

export function invalidateInlineLinkFolderIndexCache(): void {
	folderIndexCache = null;
}

export function getInlineLinkFolderIndexes(
	app: App,
	settings: FulcrumSettings,
): InlineLinkFolderIndexes {
	const peopleDirs = settings.peopleDirs.map((d) => normalizePath(d.trim())).filter(Boolean);
	const peopleDirsKey = peopleDirs.join("\0");
	const productsFolder = normalizePath(settings.productsFolder.trim());
	if (
		folderIndexCache &&
		folderIndexCache.peopleDirsKey === peopleDirsKey &&
		folderIndexCache.productsFolder === productsFolder
	) {
		return folderIndexCache.indexes;
	}
	const indexes: InlineLinkFolderIndexes = {
		people: peopleDirs.length ? buildPeopleDirsMatchIndex(app, peopleDirs) : new Map(),
		products: productsFolder ? buildFolderMatchIndex(app, productsFolder) : new Map(),
	};
	folderIndexCache = {peopleDirsKey, productsFolder, indexes};
	return indexes;
}

function lineHasWikilinkMarkup(line: string): boolean {
	return /\[\[/u.test(line);
}

function shouldScheduleLinkPillScanForFileChange(app: App, file: TFile): boolean {
	const view = app.workspace.activeLeaf?.view;
	if (
		view instanceof MarkdownView &&
		view.file?.path === file.path &&
		view.getMode() !== "preview"
	) {
		return lineHasWikilinkMarkup(view.editor.getLine(view.editor.getCursor().line));
	}
	const cache = app.metadataCache.getFileCache(file);
	return (cache?.links?.length ?? 0) > 0;
}

function buildFolderMatchIndex(app: App, folder: string): Map<string, TFile> {
	const folderNorm = normalizePath(folder.trim());
	const index = new Map<string, TFile>();
	if (!folderNorm) return index;
	for (const f of app.vault.getMarkdownFiles()) {
		if (!isUnderFolder(f.path, folderNorm)) continue;
		const cache = app.metadataCache.getFileCache(f);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		for (const k of personFileMatchKeys(f, fm)) {
			const nk = k.trim().toLowerCase().replace(/\s+/g, " ");
			if (nk) index.set(nk, f);
		}
	}
	return index;
}

function resolveFolderNote(
	app: App,
	linkTextRaw: string,
	sourcePath: string,
	peopleDirs: string[],
	matchIndex: Map<string, TFile>,
): TFile | null {
	return resolvePeopleFolderNote(app, linkTextRaw, sourcePath, peopleDirs, matchIndex);
}

function resolvePersonLink(
	app: App,
	node: HTMLElement,
	linktext: string,
	sourcePath: string,
	peopleDirs: string[],
	matchIndex: Map<string, TFile>,
): TFile | null {
	const candidates = [
		linktext,
		stripWikiLinkText(linktext),
		stripWikiLinkText(node.textContent ?? ""),
	].filter((c) => c.trim().length > 0);
	const seen = new Set<string>();
	for (const c of candidates) {
		const key = c.trim();
		if (seen.has(key)) continue;
		seen.add(key);
		const f = resolveFolderNote(app, key, sourcePath, peopleDirs, matchIndex);
		if (f) return f;
	}
	return null;
}

function buildInlinePill(
	node: HTMLElement,
	kind: PillKind,
	name: string,
	coverSrc: string | null,
	app: App,
	dest: TFile,
	sourcePath: string,
	accentCss?: string,
): void {
	const classBase = PILL_CLASS[kind];
	node.setAttribute(PILL_ATTR[kind], "1");
	node.classList.add(classBase);
	applyPillLinkTarget(app, node, dest, sourcePath);
	if (accentCss && (kind === "project" || kind === "product")) {
		applyPillAccentTint(node, accentCss);
	}
	node.replaceChildren();

	const av = document.createElement("span");
	av.className = `${classBase}__avatar`;
	av.setAttribute("aria-hidden", "true");
	if (coverSrc) {
		const img = document.createElement("img");
		img.src = coverSrc;
		img.alt = "";
		av.append(img);
	} else {
		setIcon(av, FALLBACK_ICON[kind]);
	}

	const nameEl = document.createElement("span");
	nameEl.className = `${classBase}__name`;
	nameEl.textContent = name;

	node.append(av, nameEl);
}

function isPillNode(node: HTMLElement): boolean {
	return (
		node.hasAttribute(PERSON_PILL_ATTR) ||
		node.hasAttribute(PROJECT_PILL_ATTR) ||
		node.hasAttribute(PRODUCT_PILL_ATTR)
	);
}

function fmTypeValue(
	app: App,
	file: TFile,
	typeField: string,
): string | undefined {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
	const raw = fm?.[typeField.trim() || "type"];
	if (typeof raw !== "string") return undefined;
	const t = raw.trim().toLowerCase();
	return t || undefined;
}

/** Project pills: indexed project under the configured projects root with explicit project type. */
function resolveProjectForInlinePill(
	app: App,
	dest: TFile,
	settings: FulcrumSettings,
	vaultIndex?: VaultIndex,
): IndexedProject | undefined {
	const projectsRoot = resolveProjectsRoot(settings).trim();
	if (!projectsRoot || !isUnderFolder(dest.path, projectsRoot)) return undefined;

	const project = vaultIndex?.resolveProjectByPath(dest.path);
	if (!project) return undefined;

	const projectTypeLc = settings.projectTypeValue.trim().toLowerCase() || "project";
	if (fmTypeValue(app, dest, settings.typeField) !== projectTypeLc) return undefined;

	return project;
}

/**
 * Transform internal links into people / project / product inline pills (reading, Live Preview, activity previews).
 */
export function transformInlineLinkPillsInRoot(
	app: App,
	root: HTMLElement,
	sourcePath: string,
	settings: FulcrumSettings,
	vaultIndex?: VaultIndex,
	folderIndexes?: InlineLinkFolderIndexes,
): void {
	const peopleDirs = settings.peopleDirs.map((d) => normalizePath(d.trim())).filter(Boolean);
	const productsFolder = normalizePath(settings.productsFolder.trim());
	const resolvedIndexes = folderIndexes ?? getInlineLinkFolderIndexes(app, settings);
	const peopleIndex = peopleDirs.length ? resolvedIndexes.people : new Map<string, TFile>();
	const productsIndex = productsFolder ? resolvedIndexes.products : new Map<string, TFile>();

	const anchors = collectInternalLinkNodes(root);

	for (const node of anchors) {
		if (isPillNode(node)) continue;
		if (skipLinkHost(node)) continue;

		const linktext = linkpathFromInternalLinkEl(node);
		const dest = resolveDestFile(app, linktext, sourcePath);

		if (peopleDirs.length) {
			let person: TFile | null = null;
			if (dest && isFileInPeopleDirs(dest.path, peopleDirs)) person = dest;
			if (!person) {
				person = resolvePersonLink(app, node, linktext, sourcePath, peopleDirs, peopleIndex);
			}
			if (person) {
				buildInlinePill(
					node,
					"person",
					displayNameFromFile(app, person),
					resolveCoverSrc(app, person),
					app,
					person,
					sourcePath,
				);
				continue;
			}
		}

		if (dest && dest.extension === "md") {
			const coverSrc = resolveCoverSrc(app, dest);

			const colorField = settings.projectColorField;
			const project = resolveProjectForInlinePill(app, dest, settings, vaultIndex);
			if (project) {
				const accent =
					project.color
						? resolveProjectAccentCss(project.color)
						: resolveNoteColorCss(app, dest, colorField);
				buildInlinePill(
					node,
					"project",
					project.name,
					coverSrc,
					app,
					dest,
					sourcePath,
					accent,
				);
				continue;
			}

			if (productsFolder && isUnderFolder(dest.path, productsFolder)) {
				buildInlinePill(
					node,
					"product",
					displayNameFromFile(app, dest),
					coverSrc,
					app,
					dest,
					sourcePath,
					resolveNoteColorCss(app, dest, colorField),
				);
				continue;
			}
		}

		// Unresolved wikilink: products-folder alias index only when Obsidian has no dest file.
		if (!dest && productsFolder) {
			const product = resolvePeopleFolderNote(
				app,
				linktext,
				sourcePath,
				[productsFolder],
				productsIndex,
			);
			if (product) {
				buildInlinePill(
					node,
					"product",
					displayNameFromFile(app, product),
					resolveCoverSrc(app, product),
					app,
					product,
					sourcePath,
					resolveNoteColorCss(app, product, settings.projectColorField),
				);
			}
		}
	}
}

export function registerInlineLinkPills(
	plugin: Plugin,
	getSettings: () => FulcrumSettings,
	getVaultIndex: () => VaultIndex,
): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (!ctx.sourcePath) return;
		transformInlineLinkPillsInRoot(
			plugin.app,
			el,
			ctx.sourcePath,
			getSettings(),
			getVaultIndex(),
		);
	}, 250);
}

export function registerLivePreviewLinkPillScan(
	plugin: Plugin,
	getSettings: () => FulcrumSettings,
	getVaultIndex: () => VaultIndex,
): void {
	let debounceTimer: number | undefined;

	function scanMarkdownLeaves(): void {
		const leaf = plugin.app.workspace.activeLeaf;
		const view = leaf?.view;
		if (!(view instanceof MarkdownView) || !view.file) return;
		const settings = getSettings();
		const vaultIndex = getVaultIndex();
		const folderIndexes = getInlineLinkFolderIndexes(plugin.app, settings);
		const roots = [
			view.containerEl.querySelector(".markdown-preview-view"),
			view.containerEl.querySelector(".markdown-source-view"),
		].filter((el): el is HTMLElement => el instanceof HTMLElement);
		for (const root of roots) {
			transformInlineLinkPillsInRoot(
				plugin.app,
				root,
				view.file.path,
				settings,
				vaultIndex,
				folderIndexes,
			);
		}
	}

	function scheduleScan(): void {
		window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = undefined;
			scanMarkdownLeaves();
		}, 120);
	}

	function invalidateFolderCacheIfNeeded(file: TFile): void {
		const settings = getSettings();
		const peopleDirs = settings.peopleDirs.map((d) => normalizePath(d.trim())).filter(Boolean);
		const productsFolder = normalizePath(settings.productsFolder.trim());
		if (
			(peopleDirs.length && isFileInPeopleDirs(file.path, peopleDirs)) ||
			(productsFolder && isUnderFolder(file.path, productsFolder))
		) {
			invalidateInlineLinkFolderIndexCache();
		}
	}

	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", scheduleScan));
	plugin.registerEvent(plugin.app.workspace.on("layout-change", scheduleScan));
	plugin.registerEvent(
		plugin.app.workspace.on("editor-change", (editor, view) => {
			if (!(view instanceof MarkdownView) || !view.file) return;
			if (view.getMode() === "preview") return;
			if (!lineHasWikilinkMarkup(editor.getLine(editor.getCursor().line))) return;
			scheduleScan();
		}),
	);
	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (file) => {
			if (!(file instanceof TFile && file.extension === "md")) return;
			invalidateFolderCacheIfNeeded(file);
			if (!shouldScheduleLinkPillScanForFileChange(plugin.app, file)) return;
			scheduleScan();
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on("create", () => {
			invalidateInlineLinkFolderIndexCache();
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on("delete", () => {
			invalidateInlineLinkFolderIndexCache();
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on("rename", () => {
			invalidateInlineLinkFolderIndexCache();
		}),
	);

	scheduleScan();

	plugin.register(() => {
		window.clearTimeout(debounceTimer);
	});
}

/** @deprecated Use transformInlineLinkPillsInRoot */
export function transformPeopleLinksInRoot(
	app: App,
	root: HTMLElement,
	sourcePath: string,
	settings: FulcrumSettings,
): void {
	transformInlineLinkPillsInRoot(app, root, sourcePath, settings);
}
