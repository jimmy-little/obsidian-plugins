import {MarkdownView, normalizePath, setIcon, TFile, type App, type EventRef} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {
	buildPeopleFolderMatchIndex,
	extractWikilinksFromText,
	resolvePeopleFolderNote,
} from "./projectPeople";
import {readTrackedMinutesFromFm} from "./utils/trackedMinutes";
import {parseWikiLink} from "./utils/wikilinks";
import {resolveBannerImageSrc, resolveProjectAccentCss} from "./utils/projectVisual";
import {formatTrackedMinutesShort} from "./utils/dates";
import {leafIsInWorkspace, type FulcrumCompanionLeaf} from "./openBesideFulcrum";
import {leadingTimelineEmojiFromNoteType} from "./utils/projectActivity";
import {isUnderFolder} from "./utils/paths";
import {getLapseApi} from "./lapseIntegration";

export type CompanionChromeHost = {
	readonly app: App;
	getSettings(): FulcrumSettings;
	registerEvent(ref: EventRef): void;
	/** When Lapse is installed, companion banner shows Play to start a timer in this note. */
	startLapseInOpenNote?: (
		file: TFile,
		meta: { projectLabel: string; entryTitle: string },
	) => Promise<void>;
	openNoteProperties(file: TFile): void;
	openProjectSummary(path: string): Promise<void>;
};

function fmDisplayString(v: unknown): string {
	if (v == null) return "";
	if (typeof v === "string") return v.trim();
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return "";
}

/** Link-like strings from a frontmatter scalar (wikilinks, plain path, YAML array). */
function collectLinkTextsFromFmValue(v: unknown): string[] {
	const out: string[] = [];
	if (typeof v === "string") {
		const single = parseWikiLink(v);
		if (single) out.push(single);
		out.push(...extractWikilinksFromText(v));
		const plain = v.replace(/\[\[[^\]]+]]/g, "").trim();
		if (plain && !single) out.push(plain);
	} else if (Array.isArray(v)) {
		for (const item of v) {
			out.push(...collectLinkTextsFromFmValue(item));
		}
	}
	const uniq: string[] = [];
	const seen = new Set<string>();
	for (const s of out) {
		const t = s.trim();
		if (!t || seen.has(t)) continue;
		seen.add(t);
		uniq.push(t);
	}
	return uniq;
}

function resolveFirstPeopleFileFromLinks(
	app: App,
	linkTexts: string[],
	sourcePath: string,
	folder: string,
	matchIndex: Map<string, TFile>,
): TFile | null {
	for (const link of linkTexts) {
		const dest = resolvePeopleFolderNote(app, link, sourcePath, folder, matchIndex);
		if (dest) return dest;
	}
	return null;
}

function collectPeopleFilesFromFm(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown>,
	s: FulcrumSettings,
): TFile[] {
	const folder = normalizePath(s.peopleFolder.trim());
	if (!folder) return [];

	const matchIndex = buildPeopleFolderMatchIndex(app, folder);
	const meetingsRoot = normalizePath(s.meetingsFolder.trim());
	const isMeetingNote = Boolean(meetingsRoot && isUnderFolder(sourcePath, meetingsRoot));

	const organizerKey = (s.meetingOrganizerField ?? "organizer").trim();
	let organizerFile: TFile | null = null;
	if (isMeetingNote && organizerKey) {
		const rawOrg = fm[organizerKey];
		const orgLinks = collectLinkTextsFromFmValue(rawOrg);
		organizerFile = resolveFirstPeopleFileFromLinks(app, orgLinks, sourcePath, folder, matchIndex);
	}

	const linkTexts: string[] = [];
	for (const [k, v] of Object.entries(fm)) {
		if (isMeetingNote && organizerKey && k.trim().toLowerCase() === organizerKey.toLowerCase()) {
			continue;
		}
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

	const seen = new Set<string>();
	if (organizerFile) seen.add(organizerFile.path);

	const others: TFile[] = [];
	for (const link of linkTexts) {
		const dest = resolvePeopleFolderNote(app, link, sourcePath, folder, matchIndex);
		if (!dest) continue;
		if (seen.has(dest.path)) continue;
		seen.add(dest.path);
		others.push(dest);
	}
	others.sort((a, b) => a.basename.localeCompare(b.basename, undefined, {sensitivity: "base"}));

	return organizerFile ? [organizerFile, ...others] : others;
}

function personChip(
	app: App,
	file: TFile,
	avatarField: string,
	bannerField: string,
): {name: string; avatarSrc: string | null; bannerImageSrc: string | null; path: string} {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	const name =
		(typeof fm?.name === "string" && fm.name.trim()) || file.basename.replace(/\.md$/i, "");
	const avatarRaw = fm && avatarField ? (fm[avatarField] as string | undefined) : undefined;
	const avatarSrc = resolveBannerImageSrc(app, file, avatarRaw);
	const bannerRaw = bannerField && fm ? (fm[bannerField] as string | undefined) : undefined;
	const bannerImageSrc = bannerField ? resolveBannerImageSrc(app, file, bannerRaw) : null;
	return {name, avatarSrc, bannerImageSrc, path: file.path};
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

function buildChromeDom(hostCtx: CompanionChromeHost, file: TFile, fm: Record<string, unknown>): HTMLElement {
	const app = hostCtx.app;
	const s = hostCtx.getSettings();
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
	const projFile = resolveLinkedProjectFile(app, file.path, fm, s.projectLinkField);
	const projLabel = resolveProjectLabel(app, file.path, fm, s.projectLinkField);
	let proj: HTMLElement;
	if (projFile && projLabel) {
		const projBtn = el("button", "fulcrum-companion-banner__project fulcrum-companion-banner__project--link", projLabel);
		projBtn.type = "button";
		projBtn.setAttribute("aria-label", `Open project ${projLabel}`);
		projBtn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			void hostCtx.openProjectSummary(projFile.path);
		});
		proj = projBtn;
	} else {
		proj = el("div", "fulcrum-companion-banner__project", projLabel ? projLabel : "—");
	}
	main.append(h1, proj);

	const dates = el("div", "fulcrum-companion-banner__dates fulcrum-companion-banner__dates--props-trigger");
	dates.setAttribute("role", "button");
	dates.tabIndex = 0;
	dates.setAttribute("aria-label", "Edit note properties (YAML)");
	dates.addEventListener("click", () => {
		hostCtx.openNoteProperties(file);
	});
	dates.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter" || ev.key === " ") {
			ev.preventDefault();
			hostCtx.openNoteProperties(file);
		}
	});
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

	const actionsRow = el("div", "fulcrum-companion-banner__actions");
	const lapseApi = getLapseApi(app);
	const hasLapsePlay =
		lapseApi &&
		typeof lapseApi.startTimerInNote === "function" &&
		typeof hostCtx.startLapseInOpenNote === "function";
	if (hasLapsePlay) {
		const lapseBtn = el("button", "fulcrum-companion-lapse-btn");
		lapseBtn.type = "button";
		lapseBtn.title = "Start a Lapse timer in this note";
		lapseBtn.setAttribute("aria-label", "Start a Lapse timer in this note");
		setIcon(lapseBtn, "play");
		lapseBtn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			void hostCtx.startLapseInOpenNote?.(file, {
				projectLabel: projLabel,
				entryTitle: titleBase,
			});
		});
		actionsRow.append(lapseBtn);
	}

	const tracked = readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField);
	const timeCard = el(
		"div",
		"fulcrum-companion-time-card fulcrum-companion-time-card--banner fulcrum-person-card",
	);
	const timeVal = el("div", "fulcrum-companion-time-card__value", tracked > 0 ? formatTrackedMinutesShort(tracked) : "—");
	const timeLbl = el("div", "fulcrum-companion-time-card__label", "Tracked");
	timeCard.append(timeVal, timeLbl);
	actionsRow.append(timeCard);

	if (actionsRow.childNodes.length > 0) {
		dates.append(actionsRow);
	}
	top.append(main, dates);

	const peopleRow = el("div", "fulcrum-companion-people-row");

	const avatarField = s.peopleAvatarField.trim() || "avatar";
	const bannerField = s.projectBannerField.trim() || "banner";
	const peopleFiles = collectPeopleFilesFromFm(app, file.path, fm, s);
	for (const pf of peopleFiles) {
		const p = personChip(app, pf, avatarField, bannerField);
		const btn = el("button", "fulcrum-person-card fulcrum-companion-person-card");
		btn.type = "button";
		btn.setAttribute("aria-label", p.name);
		btn.addEventListener("click", () => {
			void app.workspace.getLeaf("tab").openFile(pf);
		});
		const topZone = el("div", "fulcrum-person-card__top");
		if (p.bannerImageSrc) {
			topZone.classList.add("fulcrum-person-card__top--has-banner");
			topZone.style.backgroundImage = `url(${JSON.stringify(p.bannerImageSrc)})`;
		}
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

	surface.append(top);
	if (peopleRow.childNodes.length > 0) {
		surface.append(peopleRow);
	}
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
	view.contentEl.prepend(buildChromeDom(host, file, fm));
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
