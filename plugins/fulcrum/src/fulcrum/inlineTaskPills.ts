import {MarkdownView, type Plugin, TFile} from "obsidian";
import type {SvelteComponent} from "svelte";
import type {FulcrumHost} from "./pluginBridge";
import type {FulcrumSettings} from "./settingsDefaults";
import {parseList, parseTaskStatusChoices} from "./settingsDefaults";
import type {IndexedTask} from "./types";
import {taskIsDone} from "./taskCardInteractions";
import {
	fileHasTaskCheckboxContent,
	inlineTaskDisplayTitle,
	isCheckboxLine,
	isTaskNoteEmbedBareTitle,
	parseCheckboxLineTitle,
	parseInlineTags,
	parseObsidianTasksEmojiDates,
	stripInlineTagsForTitle,
} from "./utils/inlineTasks";
import {lineMatchesInlineTaskFilter} from "./utils/inlineTaskTag";
import {resolveInlineTaskProjectFile} from "./utils/projectLink";
import {isTaskNoteFile} from "./utils/taskNoteFile";
import {taskProjectAccentCss} from "./utils/taskCardAccent";
import {toggleInlineTaskLine} from "./taskVaultToggle";
import InlineTaskPill from "../svelte/InlineTaskPill.svelte";

const PILL_ATTR = "data-fulcrum-inline-task-pill";
const LINE_ATTR = "data-fulcrum-inline-task-line";
const SOURCE_ATTR = "data-fulcrum-inline-source";
const EMBED_TASK_ATTR = "data-fulcrum-embed-task-path";
const mountMap = new WeakMap<HTMLElement, SvelteComponent>();

interface LineTaskPresentation {
	task: IndexedTask;
	done: boolean;
	compact: boolean;
	embedHost?: {file: TFile; line: number};
}

function fmString(fm: Record<string, unknown>, key: string): string | undefined {
	const v = fm[key];
	if (v == null) return undefined;
	if (typeof v === "string") return v.trim() || undefined;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

function skipTaskHost(el: HTMLElement): boolean {
	return !!el.closest("pre, code, .fulcrum-task-note-chrome, .fulcrum-view-root");
}

function taskLineText(li: HTMLElement): string {
	const clone = li.cloneNode(true) as HTMLElement;
	clone.querySelector("input[type=checkbox]")?.remove();
	return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeTitle(text: string): string {
	const bare = parseCheckboxLineTitle(`- [ ] ${text}`) ?? text;
	return inlineTaskDisplayTitle(bare);
}

function resolveLineNo(li: HTMLElement): number | undefined {
	const raw = li.getAttribute("data-line");
	if (raw != null) {
		const n = Number.parseInt(raw, 10);
		if (Number.isFinite(n)) return n;
	}
	for (const el of Array.from(li.querySelectorAll<HTMLElement>("[data-line]"))) {
		const lineRaw = el.getAttribute("data-line");
		if (lineRaw == null) continue;
		const n = Number.parseInt(lineRaw, 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function resolveIndexedInlineTask(
	host: FulcrumHost,
	filePath: string,
	lineText: string,
	lineNo?: number,
): IndexedTask | undefined {
	const tasks = host.vaultIndex
		.getSnapshot()
		.tasks.filter((t) => t.source === "inline" && t.file.path === filePath);
	if (lineNo != null) {
		const byLine = tasks.find((t) => t.line === lineNo);
		if (byLine) return byLine;
	}
	const want = normalizeTitle(lineText);
	return tasks.find((t) => normalizeTitle(t.title) === want || t.title.trim() === want);
}

function resolveProjectFromLi(
	host: FulcrumHost,
	li: HTMLElement,
	sourcePath: string,
	lineText: string,
): TFile | null {
	const projectPaths = new Set(host.vaultIndex.getSnapshot().projects.map((p) => p.file.path));
	for (const link of Array.from(
		li.querySelectorAll<HTMLElement>("a.internal-link, span.internal-link, a[data-href]"),
	)) {
		const href =
			link.getAttribute("href")?.trim() ||
			link.dataset.href?.trim() ||
			link.getAttribute("data-href")?.trim();
		if (!href || /^https?:\/\//i.test(href) || /^mailto:/i.test(href)) continue;
		const dest = host.app.metadataCache.getFirstLinkpathDest(
			href.replace(/^#/, ""),
			sourcePath,
		);
		if (dest instanceof TFile && projectPaths.has(dest.path)) return dest;
	}
	const file = host.app.vault.getAbstractFileByPath(sourcePath);
	if (!(file instanceof TFile)) return null;
	const fm = host.app.metadataCache.getFileCache(file)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	return resolveInlineTaskProjectFile(
		host.app,
		`- [ ] ${lineText}`,
		file,
		fm,
		projectPaths,
		host.vaultIndex.getSnapshot().projects,
		host.settings.projectLinkField,
	);
}

function stubInlineTask(
	file: TFile,
	lineText: string,
	lineNo: number | undefined,
	settings: FulcrumSettings,
	isChecked: boolean,
	projectFile: TFile | null,
): IndexedTask {
	const bare = parseCheckboxLineTitle(`- [ ] ${lineText}`) ?? lineText;
	const parsed = parseObsidianTasksEmojiDates(bare);
	const openStatus = parseList(settings.taskStatuses)[0] ?? "todo";
	const doneStatus = parseList(settings.taskDoneStatuses)[0] ?? "done";
	return {
		file,
		title: inlineTaskDisplayTitle(bare),
		status: isChecked ? doneStatus : openStatus,
		dueDate: parsed.dueDate,
		scheduledDate: parsed.scheduledDate,
		projectFile,
		areaFile: null,
		tags: [],
		inlineTags: parseInlineTags(bare),
		createdAtMs: file.stat.ctime,
		source: "inline",
		line: lineNo,
		trackedMinutes: 0,
	};
}

function resolveInlineTaskForLi(
	host: FulcrumHost,
	file: TFile,
	li: HTMLElement,
	sourcePath: string,
	lineText: string,
	lineNo: number | undefined,
	settings: FulcrumSettings,
): IndexedTask {
	const indexed = resolveIndexedInlineTask(host, sourcePath, lineText, lineNo);
	if (indexed) return indexed;
	const projectFile = resolveProjectFromLi(host, li, sourcePath, lineText);
	return stubInlineTask(
		file,
		lineText,
		lineNo,
		settings,
		liHasChecked(li),
		projectFile,
	);
}

function resolveTaskNoteFileFromLi(
	host: FulcrumHost,
	li: HTMLElement,
	sourcePath: string,
): TFile | null {
	for (const link of Array.from(
		li.querySelectorAll<HTMLElement>("a.internal-link, span.internal-link, a[data-href]"),
	)) {
		const href =
			link.getAttribute("href")?.trim() ||
			link.dataset.href?.trim() ||
			link.getAttribute("data-href")?.trim();
		if (!href || /^https?:\/\//i.test(href) || /^mailto:/i.test(href)) continue;
		const dest = host.app.metadataCache.getFirstLinkpathDest(
			href.replace(/^#/, ""),
			sourcePath,
		);
		if (!(dest instanceof TFile)) continue;
		const fm = host.app.metadataCache.getFileCache(dest)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		if (isTaskNoteFile(fm, host.settings)) return dest;
	}
	return null;
}

function resolveTaskNoteTask(host: FulcrumHost, taskNoteFile: TFile): IndexedTask | null {
	const indexed = host.vaultIndex
		.getSnapshot()
		.tasks.find((t) => t.source === "taskNote" && t.file.path === taskNoteFile.path);
	if (indexed) return indexed;

	const cache = host.app.metadataCache.getFileCache(taskNoteFile);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	if (!isTaskNoteFile(fm, host.settings)) return null;

	const s = host.settings;
	const openStatus = parseTaskStatusChoices(s)[0] ?? "todo";
	return {
		file: taskNoteFile,
		title: fmString(fm, s.taskTitleField) ?? taskNoteFile.basename.replace(/\.md$/i, ""),
		status: fmString(fm, s.taskStatusField) ?? openStatus,
		priority: fmString(fm, s.taskPriorityField)?.toLowerCase(),
		dueDate: fmString(fm, s.taskDueDateField) || fmString(fm, "due"),
		scheduledDate: fmString(fm, s.taskScheduledDateField) ?? fmString(fm, "scheduled"),
		projectFile: null,
		areaFile: null,
		tags: [],
		createdAtMs: taskNoteFile.stat.ctime,
		source: "taskNote",
		trackedMinutes: 0,
	};
}

function isEmbedOnlyTaskNoteLine(bare: string, lineText: string, li: HTMLElement): boolean {
	if (isTaskNoteEmbedBareTitle(bare)) return true;
	const link = li.querySelector<HTMLElement>("a.internal-link, span.internal-link, a[data-href]");
	if (!link) return false;
	const linkText = link.textContent?.replace(/\s+/g, " ").trim() ?? "";
	const rest = lineText.replace(linkText, "").replace(/\s+/g, " ").trim();
	const parsed = parseObsidianTasksEmojiDates(rest);
	return stripInlineTagsForTitle(parsed.title).trim() === "";
}

function resolveTaskNoteEmbedPresentation(
	host: FulcrumHost,
	file: TFile,
	li: HTMLElement,
	sourcePath: string,
	lineNo: number | undefined,
	lineText: string,
): LineTaskPresentation | null {
	const taskNoteFile = resolveTaskNoteFileFromLi(host, li, sourcePath);
	if (!taskNoteFile) return null;

	const bare = parseCheckboxLineTitle(`- [ ] ${lineText}`) ?? lineText;
	if (!isEmbedOnlyTaskNoteLine(bare, lineText, li)) return null;

	const task = resolveTaskNoteTask(host, taskNoteFile);
	if (!task) return null;

	const done =
		liHasChecked(li) || taskIsDone(task, host.settings);
	return {
		task,
		done,
		compact: true,
		embedHost: lineNo != null ? {file, line: lineNo} : undefined,
	};
}

function shouldTransformTaskLine(
	host: FulcrumHost,
	file: TFile,
	li: HTMLElement,
	sourcePath: string,
	lineNo: number | undefined,
	lineText: string,
): boolean {
	if (resolveTaskNoteEmbedPresentation(host, file, li, sourcePath, lineNo, lineText)) {
		return true;
	}
	if (!lineText) return false;
	return lineMatchesInlineTaskFilter(lineText, host.settings);
}

function resolveLineTaskPresentation(
	host: FulcrumHost,
	file: TFile,
	li: HTMLElement,
	sourcePath: string,
	lineText: string,
	lineNo: number | undefined,
	settings: FulcrumSettings,
): LineTaskPresentation {
	const embed = resolveTaskNoteEmbedPresentation(
		host,
		file,
		li,
		sourcePath,
		lineNo,
		lineText,
	);
	if (embed) return embed;

	const task = resolveInlineTaskForLi(
		host,
		file,
		li,
		sourcePath,
		lineText,
		lineNo,
		settings,
	);
	return {
		task,
		done: liHasChecked(li) || taskIsDone(task, settings),
		compact: false,
	};
}

function liHasChecked(li: HTMLElement): boolean {
	const input = li.querySelector('input[type="checkbox"]');
	return input instanceof HTMLInputElement && input.checked;
}

function destroyMount(li: HTMLElement): void {
	const comp = mountMap.get(li);
	comp?.$destroy();
	mountMap.delete(li);
}

function findClaimedReadingLi(
	doc: Document,
	sourcePath: string,
	lineNo: number,
): HTMLElement | null {
	return doc.querySelector<HTMLElement>(
		`li.task-list-item[${PILL_ATTR}="reading"][${LINE_ATTR}="${lineNo}"][${SOURCE_ATTR}="${CSS.escape(sourcePath)}"]`,
	);
}

function updateReadingMount(
	host: FulcrumHost,
	li: HTMLElement,
	sourcePath: string,
	lineNo: number | undefined,
): void {
	const embedPath = li.getAttribute(EMBED_TASK_ATTR);
	if (embedPath) {
		const taskNoteFile = host.app.vault.getAbstractFileByPath(embedPath);
		if (!(taskNoteFile instanceof TFile)) return;
		const task = resolveTaskNoteTask(host, taskNoteFile);
		if (!task) return;
		const comp = mountMap.get(li);
		const done = liHasChecked(li) || taskIsDone(task, host.settings);
		comp?.$set({task, done});
		return;
	}

	if (lineNo == null) return;
	const task =
		host.vaultIndex
			.getSnapshot()
			.tasks.find(
				(t) => t.source === "inline" && t.file.path === sourcePath && t.line === lineNo,
			) ??
		resolveIndexedInlineTask(
			host,
			sourcePath,
			li.getAttribute("data-fulcrum-inline-title") ?? "",
			lineNo,
		);
	if (!task) return;
	const comp = mountMap.get(li);
	const done = taskIsDone(task, host.settings);
	comp?.$set({task, done});
}

function applyLiveEmbedLinkLabel(li: HTMLElement, title: string): void {
	const link = li.querySelector<HTMLElement>("a.internal-link, span.internal-link, a[data-href]");
	if (!link) return;
	const label = inlineTaskDisplayTitle(title);
	if (label) link.textContent = label;
}

function transformTaskListItem(
	host: FulcrumHost,
	li: HTMLElement,
	sourcePath: string,
	leaf: MarkdownView["leaf"] | undefined,
	readingMode: boolean,
): void {
	if (skipTaskHost(li)) return;

	const lineNo = resolveLineNo(li);
	const pillMode = li.getAttribute(PILL_ATTR);

	if (readingMode && pillMode === "reading") {
		updateReadingMount(host, li, sourcePath, lineNo);
		return;
	}
	if (!readingMode && pillMode === "live") return;

	const lineText = taskLineText(li);
	const file = host.app.vault.getAbstractFileByPath(sourcePath);
	if (!(file instanceof TFile)) return;
	if (!shouldTransformTaskLine(host, file, li, sourcePath, lineNo, lineText)) return;

	if (readingMode && lineNo != null) {
		const claimed = findClaimedReadingLi(li.ownerDocument, sourcePath, lineNo);
		if (claimed && claimed !== li) {
			li.style.display = "none";
			return;
		}
	}

	const presentation = resolveLineTaskPresentation(
		host,
		file,
		li,
		sourcePath,
		lineText,
		lineNo,
		host.settings,
	);
	const {task, done, compact, embedHost} = presentation;

	if (readingMode) {
		destroyMount(li);

		li.setAttribute(PILL_ATTR, "reading");
		if (lineNo != null) li.setAttribute(LINE_ATTR, String(lineNo));
		li.setAttribute(SOURCE_ATTR, sourcePath);
		li.setAttribute("data-fulcrum-inline-title", inlineTaskDisplayTitle(task.title));
		if (embedHost) li.setAttribute(EMBED_TASK_ATTR, task.file.path);
		else li.removeAttribute(EMBED_TASK_ATTR);
		li.replaceChildren();
		const mountEl = document.createElement("div");
		li.append(mountEl);
		const comp = new InlineTaskPill({
			target: mountEl,
			props: {plugin: host, task, done, anchorLeaf: leaf, compact, embedHost},
		});
		mountMap.set(li, comp);
		return;
	}

	// Live Preview / source: pill styling on native checkbox line (keeps editing)
	li.setAttribute(PILL_ATTR, "live");
	li.classList.add("fulcrum-task-inline-pill--live");
	if (compact) {
		li.classList.add("fulcrum-task-inline-pill--embed");
		applyLiveEmbedLinkLabel(li, task.title);
	} else {
		li.classList.remove("fulcrum-task-inline-pill--embed");
	}

	const accent = taskProjectAccentCss(host, task);
	li.style.setProperty("--fulcrum-task-pill-accent", accent);

	if (done) li.classList.add("fulcrum-task-inline-pill--completed");
	else li.classList.remove("fulcrum-task-inline-pill--completed");
}

function transformInlineTasksInRoot(
	host: FulcrumHost,
	root: HTMLElement,
	sourcePath: string,
	leaf: MarkdownView["leaf"] | undefined,
	readingMode: boolean,
): void {
	for (const li of Array.from(root.querySelectorAll<HTMLElement>("li.task-list-item"))) {
		transformTaskListItem(host, li, sourcePath, leaf, readingMode);
	}
}

export function registerInlineTaskPills(
	plugin: Plugin & FulcrumHost,
	getSettings: () => FulcrumSettings,
): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (!ctx.sourcePath) return;
		if (!el.classList.contains("markdown-preview-section")) return;
		transformInlineTasksInRoot(plugin, el, ctx.sourcePath, undefined, true);
	}, 250);
	void getSettings;
}

export function registerLivePreviewInlineTaskScan(plugin: Plugin & FulcrumHost): void {
	let debounceTimer: number | undefined;

	function scanActiveMarkdownLeaf(): void {
		const leaf = plugin.app.workspace.activeLeaf;
		const view = leaf?.view;
		if (!(view instanceof MarkdownView) || !view.file) return;
		if (view.getMode() === "preview") return;
		if (!fileHasTaskCheckboxContent(plugin.app, view.file)) return;
		transformInlineTasksInRoot(
			plugin,
			view.containerEl,
			view.file.path,
			view.leaf,
			false,
		);
	}

	function scheduleScan(): void {
		window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = undefined;
			scanActiveMarkdownLeaf();
		}, 120);
	}

	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", scheduleScan));
	plugin.registerEvent(plugin.app.workspace.on("layout-change", scheduleScan));
	plugin.registerEvent(
		plugin.app.workspace.on("editor-change", (editor, view) => {
			if (!(view instanceof MarkdownView) || !view.file) return;
			if (view.getMode() === "preview") return;
			if (!isCheckboxLine(editor.getLine(editor.getCursor().line))) return;
			scheduleScan();
		}),
	);
	// Metadata fires on every keystroke; inline task pills refresh from editor-change and on save.
	plugin.registerEvent(
		plugin.app.vault.on("modify", (file) => {
			if (!(file instanceof TFile && file.extension === "md")) return;
			if (!fileHasTaskCheckboxContent(plugin.app, file)) return;
			scheduleScan();
		}),
	);

	scheduleScan();

	plugin.register(() => {
		window.clearTimeout(debounceTimer);
	});
}
