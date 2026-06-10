import type {App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {VaultIndex} from "./VaultIndex";
import {transformInlineLinkPillsInRoot} from "./inlineLinkPills";

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

function parseWikiLinkInner(inner: string): {linkpath: string; display: string} {
	const pipe = inner.indexOf("|");
	if (pipe >= 0) {
		const linkpath = inner.slice(0, pipe).trim();
		const display = inner.slice(pipe + 1).trim();
		return {linkpath, display: display || linkpath};
	}
	const t = inner.trim();
	return {linkpath: t, display: t};
}

/** Activity row titles may contain wikilinks without full markdown block layout. */
export function renderActivityTitleDom(
	app: App,
	container: HTMLElement,
	title: string,
	sourcePath: string,
	settings: FulcrumSettings,
	vaultIndex: VaultIndex,
): void {
	container.empty();
	container.removeClass("markdown-preview-view");

	const span = document.createElement("span");
	span.className = "fulcrum-activity-title-inline";

	let lastIndex = 0;
	let found = false;
	for (const m of title.matchAll(WIKI_LINK_RE)) {
		found = true;
		const idx = m.index ?? 0;
		if (idx > lastIndex) {
			span.append(document.createTextNode(title.slice(lastIndex, idx)));
		}
		const {linkpath, display} = parseWikiLinkInner(m[1]!);
		const a = document.createElement("a");
		a.className = "internal-link";
		a.setAttribute("data-href", linkpath);
		a.setAttribute("href", linkpath);
		a.textContent = display;
		span.append(a);
		lastIndex = idx + m[0].length;
	}

	if (!found) {
		container.textContent = title;
		return;
	}

	if (lastIndex < title.length) {
		span.append(document.createTextNode(title.slice(lastIndex)));
	}

	container.append(span);
	transformInlineLinkPillsInRoot(app, span, sourcePath, settings, vaultIndex);
}
