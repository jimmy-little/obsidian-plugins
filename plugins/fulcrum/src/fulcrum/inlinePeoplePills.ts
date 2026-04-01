import {MarkdownView, normalizePath, type App, type Plugin, TFile} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {
	buildPeopleFolderMatchIndex,
	getPersonNameAndAvatar,
	resolvePeopleFolderNote,
} from "./projectPeople";

const PILL_ATTR = "data-fulcrum-person-pill";

/** Same silhouette as `fulcrum-person-card` when no `avatar` image is set. */
const PERSON_AVATAR_PLACEHOLDER_SVG =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>';

function skipLinkHost(el: HTMLElement): boolean {
	return !!el.closest("pre, code");
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

/** Resolve vault link path / linktext for anchors (preview/LP) and CM6 source spans. */
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

/** Collect candidates: preview uses `a.internal-link` or `a[data-href]`; source uses `span.cm-hmd-internal-link`. */
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

function resolveFileForPeopleLink(
	app: App,
	node: HTMLElement,
	linktextPrimary: string,
	sourcePath: string,
	peopleFolder: string,
	matchIndex: Map<string, TFile>,
): TFile | null {
	const folder = normalizePath(peopleFolder.trim());
	if (!folder) return null;

	const candidates = [
		linktextPrimary,
		stripWikiLinkText(linktextPrimary),
		stripWikiLinkText(node.textContent ?? ""),
	].filter((c) => c.trim().length > 0);
	const seen = new Set<string>();
	for (const c of candidates) {
		const key = c.trim();
		if (seen.has(key)) continue;
		seen.add(key);
		const f = resolvePeopleFolderNote(app, key, sourcePath, folder, matchIndex);
		if (f) return f;
	}
	return null;
}

/** Keep Obsidian navigation / unresolved state correct after replacing link text with the pill. */
function applyPeoplePillLinkTarget(app: App, node: HTMLElement, dest: TFile, sourcePath: string): void {
	const linktext =
		app.metadataCache.fileToLinktext(dest, sourcePath, true) ?? dest.basename.replace(/\.md$/i, "");
	node.setAttribute("data-href", linktext);
	if (node instanceof HTMLAnchorElement) {
		node.setAttribute("href", linktext);
	}
	node.classList.add("internal-link");
}

function transformPeopleLinksInRoot(
	app: App,
	root: HTMLElement,
	sourcePath: string,
	s: FulcrumSettings,
): void {
	const folder = normalizePath(s.peopleFolder.trim());
	if (!folder) return;

	const avatarField = s.peopleAvatarField.trim() || "avatar";
	const matchIndex = buildPeopleFolderMatchIndex(app, folder);
	const anchors = collectInternalLinkNodes(root);

	for (const node of anchors) {
		if (node.hasAttribute(PILL_ATTR)) continue;
		if (skipLinkHost(node)) continue;

		const linktext = linkpathFromInternalLinkEl(node);
		const dest = resolveFileForPeopleLink(app, node, linktext, sourcePath, folder, matchIndex);
		if (!dest) continue;

		const {name, avatarSrc} = getPersonNameAndAvatar(app, dest, avatarField);

		node.setAttribute(PILL_ATTR, "1");
		node.classList.add("fulcrum-person-inline-pill");
		applyPeoplePillLinkTarget(app, node, dest, sourcePath);
		node.replaceChildren();

		const av = document.createElement("span");
		av.className = "fulcrum-person-inline-pill__avatar";
		av.setAttribute("aria-hidden", "true");
		if (avatarSrc) {
			const img = document.createElement("img");
			img.src = avatarSrc;
			img.alt = "";
			av.append(img);
		} else {
			av.innerHTML = PERSON_AVATAR_PLACEHOLDER_SVG;
		}

		const nameEl = document.createElement("span");
		nameEl.className = "fulcrum-person-inline-pill__name";
		nameEl.textContent = name;

		node.append(av, nameEl);
	}
}

/**
 * Reading view: markdown post-processor. Live Preview does not use this path — see {@link registerLivePreviewPeoplePillScan}.
 * Sort order 250 runs late so links are fully rendered.
 */
export function registerInlinePeoplePills(
	plugin: Plugin,
	getSettings: () => FulcrumSettings,
): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (!ctx.sourcePath) return;
		transformPeopleLinksInRoot(plugin.app, el, ctx.sourcePath, getSettings());
	}, 250);
}

/**
 * Source mode (CodeMirror `span.cm-hmd-internal-link`), Live Preview, and any view where
 * post-processors are not used: scan editor DOM when it changes.
 */
export function registerLivePreviewPeoplePillScan(
	plugin: Plugin,
	getSettings: () => FulcrumSettings,
): void {
	let debounceTimer: number | undefined;

	function scanMarkdownLeaves(): void {
		plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) return;
			transformPeopleLinksInRoot(
				plugin.app,
				view.containerEl,
				view.file.path,
				getSettings(),
			);
		});
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
