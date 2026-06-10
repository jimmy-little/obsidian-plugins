import {MarkdownView, normalizePath, setIcon, type App, type Plugin, TFile} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {VaultIndex} from "./VaultIndex";
import {
	buildPeopleFolderMatchIndex,
	personFileMatchKeys,
	resolvePeopleFolderNote,
} from "./projectPeople";
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

function skipLinkHost(el: HTMLElement): boolean {
	return !!el.closest("pre, code, li.task-list-item");
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
	folder: string,
	matchIndex: Map<string, TFile>,
): TFile | null {
	return resolvePeopleFolderNote(app, linkTextRaw, sourcePath, folder, matchIndex);
}

function resolvePersonLink(
	app: App,
	node: HTMLElement,
	linktext: string,
	sourcePath: string,
	peopleFolder: string,
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
		const f = resolveFolderNote(app, key, sourcePath, peopleFolder, matchIndex);
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

/**
 * Transform internal links into people / project / product inline pills (reading, Live Preview, activity previews).
 */
export function transformInlineLinkPillsInRoot(
	app: App,
	root: HTMLElement,
	sourcePath: string,
	settings: FulcrumSettings,
	vaultIndex?: VaultIndex,
): void {
	const peopleFolder = normalizePath(settings.peopleFolder.trim());
	const productsFolder = normalizePath(settings.productsFolder.trim());
	const peopleIndex = peopleFolder ? buildPeopleFolderMatchIndex(app, peopleFolder) : new Map();
	const productsIndex = productsFolder ? buildFolderMatchIndex(app, productsFolder) : new Map();

	const anchors = collectInternalLinkNodes(root);

	for (const node of anchors) {
		if (isPillNode(node)) continue;
		if (skipLinkHost(node)) continue;

		const linktext = linkpathFromInternalLinkEl(node);
		const dest = resolveDestFile(app, linktext, sourcePath);

		if (peopleFolder) {
			let person: TFile | null = null;
			if (dest && isUnderFolder(dest.path, peopleFolder)) person = dest;
			if (!person) {
				person = resolvePersonLink(app, node, linktext, sourcePath, peopleFolder, peopleIndex);
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
			const project = vaultIndex?.resolveProjectByPath(dest.path);
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
			const product = resolveFolderNote(app, linktext, sourcePath, productsFolder, productsIndex);
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
		transformInlineLinkPillsInRoot(
			plugin.app,
			view.containerEl,
			view.file.path,
			getSettings(),
			getVaultIndex(),
		);
	}

	function scheduleScan(): void {
		window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = undefined;
			scanMarkdownLeaves();
		}, 120);
	}

	const mo = new MutationObserver(() => {
		scheduleScan();
	});
	mo.observe(plugin.app.workspace.containerEl, {childList: true, subtree: true});

	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", scheduleScan));
	plugin.registerEvent(plugin.app.workspace.on("layout-change", scheduleScan));
	plugin.registerEvent(
		plugin.app.workspace.on("editor-change", () => {
			scheduleScan();
		}),
	);
	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (file) => {
			if (file instanceof TFile && file.extension === "md") scheduleScan();
		}),
	);

	scheduleScan();

	plugin.register(() => {
		window.clearTimeout(debounceTimer);
		mo.disconnect();
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
