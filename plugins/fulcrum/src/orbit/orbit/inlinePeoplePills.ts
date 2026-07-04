import {setIcon, TFile, type App} from "obsidian";
import {resolvePersonAvatarSrc} from "./personAvatar";
import {displayNameForPerson, readPersonFrontmatter} from "./personModel";
import {
	buildPeopleDirsMatchIndex,
	resolvePersonLink,
	type ResolvedPersonLink,
} from "./peopleResolve";
import type {OrbitSettings} from "./settings";

const PERSON_PILL_ATTR = "data-orbit-person-pill";
const GHOST_PILL_ATTR = "data-orbit-person-ghost-pill";

export type OrbitPeoplePillActions = {
	openPersonPath: (path: string) => void | Promise<void>;
	createPersonNote: (linkText: string, displayName: string) => void | Promise<void>;
};

function skipLinkHost(el: HTMLElement): boolean {
	return !!el.closest("pre, code");
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

function isPillNode(node: HTMLElement): boolean {
	return node.hasAttribute(PERSON_PILL_ATTR) || node.hasAttribute(GHOST_PILL_ATTR);
}

function displayNameFromNode(node: HTMLElement, linktext: string): string {
	const text = node.textContent?.trim();
	return text && text.length > 0 ? text : linktext;
}

type ActivityPersonResolution =
	| {action: "known"; resolved: Extract<ResolvedPersonLink, {kind: "known"}>}
	| {action: "ghost"; resolved: Extract<ResolvedPersonLink, {kind: "ghost"}>}
	| {action: "skip"};

/**
 * Activity previews: pill known people, ghost only unresolved links.
 * Resolved notes outside `peopleDirs` (meetings, projects) stay plain links.
 */
function resolvePersonForActivityLink(
	app: App,
	node: HTMLElement,
	linktext: string,
	sourcePath: string,
	settings: OrbitSettings,
	matchIndex: Map<string, TFile>,
): ActivityPersonResolution {
	const displayHint = displayNameFromNode(node, linktext);
	const candidates = [linktext, displayHint].filter((c) => c.trim().length > 0);
	const seen = new Set<string>();
	for (const c of candidates) {
		const key = c.trim();
		if (seen.has(key)) continue;
		seen.add(key);
		const resolved = resolvePersonLink(
			app,
			key,
			displayHint,
			sourcePath,
			settings.peopleDirs,
			matchIndex,
		);
		if (resolved.kind === "known") return {action: "known", resolved};
	}

	const dest = app.metadataCache.getFirstLinkpathDest(linktext.trim(), sourcePath);
	if (dest instanceof TFile) return {action: "skip"};

	return {
		action: "ghost",
		resolved: resolvePersonLink(
			app,
			linktext,
			displayHint,
			sourcePath,
			settings.peopleDirs,
			matchIndex,
		) as Extract<ResolvedPersonLink, {kind: "ghost"}>,
	};
}

function buildKnownPersonPill(
	node: HTMLElement,
	app: App,
	file: TFile,
	displayName: string,
	sourcePath: string,
	avatarField: string,
	actions: OrbitPeoplePillActions,
): void {
	node.setAttribute(PERSON_PILL_ATTR, "1");
	node.classList.add("fulcrum-person-inline-pill");
	node.replaceChildren();

	const av = document.createElement("span");
	av.className = "fulcrum-person-inline-pill__avatar";
	av.setAttribute("aria-hidden", "true");
	const avatarSrc = resolvePersonAvatarSrc(app, file, avatarField);
	if (avatarSrc) {
		const img = document.createElement("img");
		img.src = avatarSrc;
		img.alt = "";
		av.append(img);
	} else {
		setIcon(av, "user");
	}

	const nameEl = document.createElement("span");
	nameEl.className = "fulcrum-person-inline-pill__name";
	nameEl.textContent = displayName;

	node.append(av, nameEl);
	node.setAttribute("role", "button");
	node.setAttribute("tabindex", "0");
	node.setAttribute("aria-label", displayName);

	const open = (ev: Event): void => {
		ev.preventDefault();
		ev.stopPropagation();
		void actions.openPersonPath(file.path);
	};
	node.addEventListener("click", open);
	node.addEventListener("keydown", (ev) => {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		open(ev);
	});
}

function buildGhostPersonPill(
	node: HTMLElement,
	linkText: string,
	displayName: string,
	actions: OrbitPeoplePillActions,
): void {
	node.setAttribute(GHOST_PILL_ATTR, "1");
	node.classList.add("fulcrum-person-inline-pill", "fulcrum-person-inline-pill--ghost");
	node.replaceChildren();

	const av = document.createElement("span");
	av.className = "fulcrum-person-inline-pill__avatar";
	av.setAttribute("aria-hidden", "true");
	setIcon(av, "ghost");

	const nameEl = document.createElement("span");
	nameEl.className = "fulcrum-person-inline-pill__name";
	nameEl.textContent = displayName;

	node.append(av, nameEl);
	node.setAttribute("role", "button");
	node.setAttribute("tabindex", "0");
	node.setAttribute("aria-label", `${displayName} (create person note)`);
	node.setAttribute("title", "Create person note");

	const create = (ev: Event): void => {
		ev.preventDefault();
		ev.stopPropagation();
		void actions.createPersonNote(linkText, displayName);
	};
	node.addEventListener("click", create);
	node.addEventListener("keydown", (ev) => {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		create(ev);
	});
}

/** Transform internal links in a DOM root into known or ghost person pills. */
export function transformInlinePeoplePillsInRoot(
	app: App,
	root: HTMLElement,
	sourcePath: string,
	settings: OrbitSettings,
	actions: OrbitPeoplePillActions,
): void {
	if (!settings.peopleDirs.length) return;

	const matchIndex = buildPeopleDirsMatchIndex(app, settings.peopleDirs);
	const anchors = collectInternalLinkNodes(root);

	for (const node of anchors) {
		if (isPillNode(node)) continue;
		if (skipLinkHost(node)) continue;

		const linktext = linkpathFromInternalLinkEl(node);
		if (!linktext) continue;

		const outcome = resolvePersonForActivityLink(
			app,
			node,
			linktext,
			sourcePath,
			settings,
			matchIndex,
		);
		if (outcome.action === "skip") continue;
		if (outcome.action === "known") {
			const resolved = outcome.resolved;
			const fm = readPersonFrontmatter(app.metadataCache.getFileCache(resolved.file));
			const name = displayNameForPerson(fm, resolved.file.basename) || resolved.displayName;
			buildKnownPersonPill(
				node,
				app,
				resolved.file,
				name,
				sourcePath,
				settings.avatarFrontmatterField,
				actions,
			);
		} else {
			buildGhostPersonPill(
				node,
				outcome.resolved.linkText,
				outcome.resolved.displayName,
				actions,
			);
		}
	}
}
