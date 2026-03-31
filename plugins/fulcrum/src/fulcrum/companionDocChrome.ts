import {MarkdownView, normalizePath, TFile, type App, type EventRef} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {extractWikilinksFromText} from "./projectPeople";
import {readTrackedMinutesFromFm} from "./utils/trackedMinutes";
import {parseWikiLink} from "./utils/wikilinks";
import {isUnderFolder} from "./utils/paths";
import {resolveBannerImageSrc, resolveProjectAccentCss} from "./utils/projectVisual";
import {formatTrackedMinutesShort} from "./utils/dates";
import {leafIsInWorkspace, type FulcrumCompanionLeaf} from "./openBesideFulcrum";
import {leadingTimelineEmojiFromNoteType} from "./utils/projectActivity";

export type CompanionChromeHost = {
	readonly app: App;
	getSettings(): FulcrumSettings;
	registerEvent(ref: EventRef): void;
};

function fmDisplayString(v: unknown): string {
	if (v == null) return "";
	if (typeof v === "string") return v.trim();
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return "";
}

function collectPeopleFilesFromFm(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown>,
	peopleFolder: string,
): TFile[] {
	const folder = normalizePath(peopleFolder.trim());
	if (!folder) return [];
	const linkTexts: string[] = [];
	for (const v of Object.values(fm)) {
		if (typeof v === "string") {
			linkTexts.push(...extractWikilinksFromText(v));
			const single = parseWikiLink(v);
			if (single) linkTexts.push(single);
		} else if (Array.isArray(v)) {
			for (const item of v) {
				if (typeof item === "string") {
					linkTexts.push(...extractWikilinksFromText(item));
					const single = parseWikiLink(item);
					if (single) linkTexts.push(single);
				}
			}
		}
	}
	const files: TFile[] = [];
	const seen = new Set<string>();
	for (const link of linkTexts) {
		const dest = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
		if (!(dest instanceof TFile)) continue;
		if (!isUnderFolder(dest.path, folder)) continue;
		if (seen.has(dest.path)) continue;
		seen.add(dest.path);
		files.push(dest);
	}
	files.sort((a, b) => a.basename.localeCompare(b.basename, undefined, {sensitivity: "base"}));
	return files;
}

function personChip(
	app: App,
	file: TFile,
	avatarField: string,
): {name: string; avatarSrc: string | null; path: string} {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	const name =
		(typeof fm?.name === "string" && fm.name.trim()) || file.basename.replace(/\.md$/i, "");
	const avatarRaw = fm && avatarField ? (fm[avatarField] as string | undefined) : undefined;
	const avatarSrc = resolveBannerImageSrc(app, file, avatarRaw);
	return {name, avatarSrc, path: file.path};
}

function resolveLinkedProjectFile(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown>,
	linkKey: string,
): TFile | null {
	const raw = fm[linkKey.trim()];
	const link =
		typeof raw === "string"
			? parseWikiLink(raw) ?? (raw.trim() && !raw.includes("[[") ? raw.trim() : null)
			: null;
	if (!link) return null;
	const dest = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
	return dest instanceof TFile ? dest : null;
}

function resolveProjectLabel(app: App, sourcePath: string, fm: Record<string, unknown>, linkKey: string): string {
	const dest = resolveLinkedProjectFile(app, sourcePath, fm, linkKey);
	if (dest) {
		const destFm = app.metadataCache.getFileCache(dest)?.frontmatter as Record<string, unknown> | undefined;
		return destFm && typeof destFm.name === "string" && destFm.name.trim()
			? destFm.name.trim()
			: dest.basename.replace(/\.md$/i, "");
	}
	const raw = fm[linkKey.trim()];
	if (typeof raw !== "string") return "";
	return parseWikiLink(raw) ?? raw.trim();
}

/** Project note accent for banner tint (linked project’s `color` field, else theme fallback). */
function resolveBannerAccentCss(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown>,
	s: FulcrumSettings,
): string {
	const proj = resolveLinkedProjectFile(app, sourcePath, fm, s.projectLinkField);
	if (!proj) {
		return resolveProjectAccentCss(undefined, "var(--interactive-accent)");
	}
	const projFm = app.metadataCache.getFileCache(proj)?.frontmatter as Record<string, unknown> | undefined;
	const colorKey = s.projectColorField.trim() || "color";
	const raw = projFm?.[colorKey];
	const str = typeof raw === "string" ? raw : undefined;
	return resolveProjectAccentCss(str, "var(--interactive-accent)");
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function formatCompanionDateDisplay(raw: string): string {
	const s = raw.trim();
	if (!s) return "";
	if (ISO_DATE_ONLY.test(s)) {
		const d = new Date(s + "T12:00:00");
		if (Number.isNaN(d.getTime())) return raw;
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		}).format(d);
	}
	const ms = Date.parse(s);
	if (Number.isNaN(ms)) return raw;
	const d = new Date(ms);
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: false,
	}).format(d);
}

function entryTitle(file: TFile, fm: Record<string, unknown>, entryKey: string): string {
	const k = entryKey.trim() || "entry";
	const raw = fm[k];
	const s = fmDisplayString(raw);
	if (s) return s;
	return file.basename.replace(/\.md$/i, "");
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	cls: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.className = cls;
	if (text != null) node.textContent = text;
	return node;
}

function buildChromeDom(
	app: App,
	file: TFile,
	fm: Record<string, unknown>,
	s: FulcrumSettings,
): HTMLElement {
	const host = el("div", "fulcrum-companion-chrome-host");

	const accentCss = resolveBannerAccentCss(app, file.path, fm, s);
	host.style.setProperty("--fulcrum-companion-accent", accentCss);

	const surface = el("div", "fulcrum-companion-chrome-surface");

	const top = el("div", "fulcrum-companion-banner");
	const main = el("div", "fulcrum-companion-banner__main");
	const titleBase = entryTitle(file, fm, s.atomicNoteEntryField);
	const typeKey = s.typeField.trim() || "type";
	const typeRaw = fmDisplayString(fm[typeKey]);
	const leadEmoji = leadingTimelineEmojiFromNoteType(typeRaw);
	const titleDisplay = leadEmoji ? `${leadEmoji} ${titleBase}` : titleBase;
	const h1 = el("h1", "fulcrum-companion-banner__title", titleDisplay);
	const proj = el("div", "fulcrum-companion-banner__project");
	const projLabel = resolveProjectLabel(app, file.path, fm, s.projectLinkField);
	proj.textContent = projLabel ? projLabel : "—";
	main.append(h1, proj);

	const dates = el("div", "fulcrum-companion-banner__dates");
	const dateRows: [string, string][] = [
		["Date", fmDisplayString(fm.date)],
		["Start", fmDisplayString(fm.startTime)],
		["End", fmDisplayString(fm.endTime)],
	];
	for (const [label, val] of dateRows) {
		if (!val) continue;
		const row = el("div", "fulcrum-companion-banner__date-row");
		row.append(
			el("span", "fulcrum-companion-banner__date-label", label),
			el("span", "fulcrum-companion-banner__date-val", formatCompanionDateDisplay(val)),
		);
		dates.append(row);
	}
	top.append(main, dates);

	const peopleRow = el("div", "fulcrum-companion-people-row");

	const avatarField = s.peopleAvatarField.trim() || "avatar";
	const peopleFiles = collectPeopleFilesFromFm(app, file.path, fm, s.peopleFolder);
	for (const pf of peopleFiles) {
		const p = personChip(app, pf, avatarField);
		const btn = el("button", "fulcrum-person-card fulcrum-companion-person-card");
		btn.type = "button";
		btn.setAttribute("aria-label", p.name);
		btn.addEventListener("click", () => {
			void app.workspace.getLeaf("tab").openFile(pf);
		});
		const topZone = el("div", "fulcrum-person-card__top");
		const av = el("div", "fulcrum-person-card__avatar");
		if (p.avatarSrc) {
			const img = document.createElement("img");
			img.src = p.avatarSrc;
			img.alt = "";
			av.append(img);
		} else {
			av.innerHTML =
				'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>';
		}
		topZone.append(av);
		btn.append(topZone, el("span", "fulcrum-person-card__name", p.name));
		peopleRow.append(btn);
	}

	const tracked = readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField);
	const timeCard = el("div", "fulcrum-companion-time-card fulcrum-person-card");
	const timeVal = el("div", "fulcrum-companion-time-card__value", tracked > 0 ? formatTrackedMinutesShort(tracked) : "—");
	const timeLbl = el("div", "fulcrum-companion-time-card__label", "Tracked");
	timeCard.append(timeVal, timeLbl);
	peopleRow.append(timeCard);

	surface.append(top, peopleRow);
	host.append(surface);

	return host;
}

function clearCompanionChrome(view: MarkdownView): void {
	view.contentEl.classList.remove("fulcrum-companion-doc");
	view.contentEl.querySelector(":scope > .fulcrum-companion-chrome-host")?.remove();
}

function syncCompanionChrome(host: CompanionChromeHost, companion: FulcrumCompanionLeaf): void {
	const {app} = host;
	const leaf = companion.current;
	if (!leaf || !leafIsInWorkspace(app, leaf)) return;

	const view = leaf.view;
	if (!(view instanceof MarkdownView)) return;

	const file = view.file;
	if (!file || file.extension !== "md") {
		clearCompanionChrome(view);
		return;
	}

	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

	view.contentEl.classList.add("fulcrum-companion-doc");
	const prev = view.contentEl.querySelector(":scope > .fulcrum-companion-chrome-host");
	prev?.remove();
	view.contentEl.prepend(buildChromeDom(app, file, fm, host.getSettings()));
}

/** Debounced refresh when metadata / files change. */
export function registerCompanionDocChrome(
	host: CompanionChromeHost,
	companion: FulcrumCompanionLeaf,
): void {
	let timer: number | undefined;

	function schedule(): void {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			syncCompanionChrome(host, companion);
		}, 80);
	}

	host.registerEvent(host.app.workspace.on("file-open", schedule));
	host.registerEvent(host.app.workspace.on("layout-change", schedule));
	host.registerEvent(host.app.workspace.on("active-leaf-change", schedule));
	host.registerEvent(
		host.app.metadataCache.on("changed", (f) => {
			const leaf = companion.current;
			if (!leaf || !leafIsInWorkspace(host.app, leaf)) return;
			const v = leaf.view;
			if (!(v instanceof MarkdownView)) return;
			if (f instanceof TFile && v.file?.path === f.path) schedule();
		}),
	);

	schedule();
}
