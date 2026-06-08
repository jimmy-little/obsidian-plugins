import {MarkdownView, type Plugin, TFile} from "obsidian";
import type {SvelteComponent} from "svelte";
import type {FulcrumHost} from "./pluginBridge";
import type {FulcrumSettings} from "./settingsDefaults";
import {parseList} from "./settingsDefaults";
import type {IndexedTask} from "./types";
import {taskIsDone} from "./taskCardInteractions";
import {
	inlineTaskDisplayTitle,
	parseCheckboxLineTitle,
	parseInlineTags,
	parseObsidianTasksEmojiDates,
} from "./utils/inlineTasks";
import {lineMatchesInlineTaskFilter} from "./utils/inlineTaskTag";
import {taskProjectAccentCss} from "./utils/taskCardAccent";
import TaskCardNote from "../svelte/TaskCardNote.svelte";

const PILL_ATTR = "data-fulcrum-inline-task-pill";
const mountMap = new WeakMap<HTMLElement, SvelteComponent>();

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

function stubInlineTask(
	file: TFile,
	lineText: string,
	lineNo: number | undefined,
	settings: FulcrumSettings,
	isChecked: boolean,
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
		projectFile: null,
		areaFile: null,
		tags: [],
		inlineTags: parseInlineTags(bare),
		createdAtMs: file.stat.ctime,
		source: "inline",
		line: lineNo,
		trackedMinutes: 0,
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

function transformTaskListItem(
	host: FulcrumHost,
	li: HTMLElement,
	sourcePath: string,
	leaf: MarkdownView["leaf"] | undefined,
	readingMode: boolean,
): void {
	if (skipTaskHost(li)) return;
	const lineText = taskLineText(li);
	if (!lineText || !lineMatchesInlineTaskFilter(lineText, host.settings)) return;

	const file = host.app.vault.getAbstractFileByPath(sourcePath);
	if (!(file instanceof TFile)) return;

	const lineNo = li.getAttribute("data-line")
		? Number.parseInt(li.getAttribute("data-line")!, 10)
		: undefined;

	if (readingMode) {
		if (li.getAttribute(PILL_ATTR) === "reading") {
			const task = resolveIndexedInlineTask(host, sourcePath, lineText, lineNo);
			if (task) {
				const comp = mountMap.get(li);
				const done = taskIsDone(task, host.settings);
				comp?.$set({task, done});
			}
			return;
		}

		destroyMount(li);
		const task =
			resolveIndexedInlineTask(host, sourcePath, lineText, lineNo) ??
			stubInlineTask(file, lineText, lineNo, host.settings, liHasChecked(li));
		const done = liHasChecked(li) || taskIsDone(task, host.settings);

		li.setAttribute(PILL_ATTR, "reading");
		li.replaceChildren();
		const mountEl = document.createElement("div");
		li.append(mountEl);
		const comp = new TaskCardNote({
			target: mountEl,
			props: {plugin: host, task, done, anchorLeaf: leaf},
		});
		mountMap.set(li, comp);
		return;
	}

	// Live Preview / source: pill styling on native checkbox line (keeps editing)
	if (li.getAttribute(PILL_ATTR) === "live") return;
	li.setAttribute(PILL_ATTR, "live");
	li.classList.add("fulcrum-task-inline-pill--live");

	const task =
		resolveIndexedInlineTask(host, sourcePath, lineText, lineNo) ??
		stubInlineTask(file, lineText, lineNo, host.settings, liHasChecked(li));
	const accent = taskProjectAccentCss(host, task);
	li.style.setProperty("--fulcrum-task-pill-accent", accent);

	if (liHasChecked(li)) li.classList.add("fulcrum-task-inline-pill--completed");
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
		transformInlineTasksInRoot(plugin, el, ctx.sourcePath, undefined, true);
	}, 250);
	void getSettings;
}

export function registerLivePreviewInlineTaskScan(plugin: Plugin & FulcrumHost): void {
	let debounceTimer: number | undefined;

	function scanMarkdownLeaves(): void {
		for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;
			if (view.getMode() === "preview") continue;
			transformInlineTasksInRoot(
				plugin,
				view.containerEl,
				view.file.path,
				view.leaf,
				false,
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

	const mo = new MutationObserver(() => scheduleScan());
	mo.observe(plugin.app.workspace.containerEl, {childList: true, subtree: true});

	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", scheduleScan));
	plugin.registerEvent(plugin.app.workspace.on("layout-change", scheduleScan));
	plugin.registerEvent(plugin.app.workspace.on("editor-change", scheduleScan));
	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (file) => {
			if (file instanceof TFile && file.extension === "md") scheduleScan();
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on("modify", (file) => {
			if (file instanceof TFile && file.extension === "md") scheduleScan();
		}),
	);

	scheduleScan();

	plugin.register(() => {
		window.clearTimeout(debounceTimer);
		mo.disconnect();
	});
}
