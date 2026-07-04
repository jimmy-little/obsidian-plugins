import {MarkdownView, normalizePath, setIcon, TFile, type App, type EventRef} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {timerRevision} from "./stores";
import type {TimeEntry} from "../timer/types";
import {collectPeopleRefsFromNoteFrontmatter, extractWikilinksFromText} from "./projectPeople";
import {buildPersonCardButton} from "./personCardDom";
import {readTrackedMinutesFromFm} from "./utils/trackedMinutes";
import {parseWikiLink} from "./utils/wikilinks";
import {resolveBannerImageSrc, resolveProjectAccentCss} from "./utils/projectVisual";
import {isTaskNoteFile} from "./utils/taskNoteFile";
import {formatTrackedMinutesShort} from "./utils/dates";
import {leafIsInWorkspace, type FulcrumCompanionLeaf} from "./openBesideFulcrum";
import {leadingTimelineEmojiFromNoteType} from "./utils/projectActivity";

export type CompanionChromeTimerApi = {
	findActiveEntryForFile(filePath: string): TimeEntry | null;
	getActiveEntryElapsedMs(entry: TimeEntry): number;
	formatTimeAsHHMMSS(ms: number): string;
};

export type CompanionChromeHost = {
	readonly app: App;
	getSettings(): FulcrumSettings;
	registerEvent(ref: EventRef): void;
	registerCleanup?(fn: () => void): void;
	readonly timer?: CompanionChromeTimerApi;
	/** Start a timer in the open companion note. */
	startTimerInOpenNote?: (
		file: TFile,
		meta: { projectLabel: string; entryTitle: string },
	) => Promise<void>;
	openNoteProperties(file: TFile): void;
	openProjectSummary(path: string): Promise<void>;
	createPersonNote(linkText: string, displayName: string): Promise<void>;
	openPersonFile(file: TFile): Promise<void>;
};

const trackedTickers = new WeakMap<HTMLElement, () => void>();

function clearTrackedTicker(host: HTMLElement): void {
	trackedTickers.get(host)?.();
	trackedTickers.delete(host);
}

function mountTrackedTimeTicker(
	chromeHost: HTMLElement,
	hostCtx: CompanionChromeHost,
	file: TFile,
	timeVal: HTMLElement,
): void {
	if (!hostCtx.timer) return;
	const timerApi = hostCtx.timer;

	const s = hostCtx.getSettings();
	let tickId: number | undefined;

	function update(): void {
		const active = timerApi.findActiveEntryForFile(file.path);
		if (active?.startTime) {
			const elapsed = timerApi.getActiveEntryElapsedMs(active);
			timeVal.textContent = timerApi.formatTimeAsHHMMSS(elapsed);
			timeVal.classList.add("fulcrum-companion-time-card__value--live");
			return;
		}
		timeVal.classList.remove("fulcrum-companion-time-card__value--live");
		const cache = hostCtx.app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const tracked = readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField);
		timeVal.textContent = tracked > 0 ? formatTrackedMinutesShort(tracked) : "—";
	}

	update();
	tickId = window.setInterval(update, 1000);
	trackedTickers.set(chromeHost, () => {
		if (tickId != null) window.clearInterval(tickId);
	});
}

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
	if (typeof hostCtx.startTimerInOpenNote === "function") {
		const timerBtn = el("button", "fulcrum-companion-timer-btn");
		timerBtn.type = "button";
		timerBtn.title = "Start a timer in this note";
		timerBtn.setAttribute("aria-label", "Start a timer in this note");
		setIcon(timerBtn, "play");
		timerBtn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			void hostCtx.startTimerInOpenNote?.(file, {
				projectLabel: projLabel,
				entryTitle: titleBase,
			});
		});
		actionsRow.append(timerBtn);
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
	mountTrackedTimeTicker(host, hostCtx, file, timeVal);

	if (actionsRow.childNodes.length > 0) {
		dates.append(actionsRow);
	}
	top.append(main, dates);

	const peopleRow = el("div", "fulcrum-companion-people-row");

	const peopleRefs = collectPeopleRefsFromNoteFrontmatter(app, file.path, fm, s);
	for (const person of peopleRefs) {
		peopleRow.append(
			buildPersonCardButton(
				person,
				(path) => {
					const pf = app.vault.getAbstractFileByPath(path);
					if (pf instanceof TFile) void hostCtx.openPersonFile(pf);
				},
				(linkText, displayName) => void hostCtx.createPersonNote(linkText, displayName),
				"fulcrum-companion-person-card",
			),
		);
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

	if (isTaskNoteFile(fm, host.getSettings())) {
		clearCompanionChrome(view);
		return;
	}

	view.contentEl.classList.add("fulcrum-companion-doc");
	const prev = view.contentEl.querySelector(":scope > .fulcrum-companion-chrome-host");
	if (prev instanceof HTMLElement) clearTrackedTicker(prev);
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
	// Metadata fires on every keystroke; companion chrome only needs frontmatter updates on save.
	host.registerEvent(
		host.app.vault.on("modify", (f) => {
			const leaf = companion.current;
			if (!leaf || !leafIsInWorkspace(host.app, leaf)) return;
			const v = leaf.view;
			if (!(v instanceof MarkdownView)) return;
			if (f instanceof TFile && v.file?.path === f.path) schedule();
		}),
	);

	const unsubTimer = timerRevision.subscribe(() => schedule());
	host.registerCleanup?.(unsubTimer);

	schedule();
}
