import {MarkdownView, TFile, type EventRef, type Plugin} from "obsidian";
import type {SvelteComponent} from "svelte";
import type {FulcrumHost} from "./pluginBridge";
import {parseList, parseTaskStatusChoices} from "./settingsDefaults";
import type {IndexedTask} from "./types";
import {isTaskNoteFile} from "./utils/taskNoteFile";
import {taskIsDone} from "./taskCardInteractions";
import TaskCard from "../svelte/TaskCard.svelte";

type MountState = {
	component: SvelteComponent | null;
	filePath: string | null;
};

const mounts = new WeakMap<MarkdownView, MountState>();

function fmString(fm: Record<string, unknown>, key: string): string | undefined {
	const v = fm[key];
	if (v == null) return undefined;
	if (typeof v === "string") return v.trim() || undefined;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

function resolveTaskForFile(host: FulcrumHost, file: TFile): IndexedTask | null {
	const indexed = host.vaultIndex
		.getSnapshot()
		.tasks.find((t) => t.source === "taskNote" && t.file.path === file.path);
	if (indexed) return indexed;

	const cache = host.app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	if (!isTaskNoteFile(fm, host.settings)) return null;

	const s = host.settings;
	const openStatus = parseTaskStatusChoices(s)[0] ?? "todo";
	return {
		file,
		title: fmString(fm, s.taskTitleField) ?? file.basename.replace(/\.md$/i, ""),
		status: fmString(fm, s.taskStatusField) ?? openStatus,
		priority: fmString(fm, s.taskPriorityField)?.toLowerCase(),
		dueDate: fmString(fm, s.taskDueDateField) || fmString(fm, "due"),
		scheduledDate: fmString(fm, s.taskScheduledDateField) ?? fmString(fm, "scheduled"),
		projectFile: null,
		areaFile: null,
		tags: [],
		createdAtMs: file.stat.ctime,
		source: "taskNote",
		trackedMinutes: 0,
	};
}

function unmountChrome(view: MarkdownView): void {
	view.contentEl.classList.remove("fulcrum-task-note-doc");
	const hostEl = view.contentEl.querySelector(":scope > .fulcrum-task-note-chrome");
	const state = mounts.get(view);
	state?.component?.$destroy();
	mounts.set(view, {component: null, filePath: null});
	hostEl?.remove();
}

function syncTaskNoteChrome(host: FulcrumHost, view: MarkdownView): void {
	const file = view.file;
	if (!file || file.extension !== "md") {
		unmountChrome(view);
		return;
	}

	const cache = host.app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	if (!isTaskNoteFile(fm, host.settings)) {
		unmountChrome(view);
		return;
	}

	const task = resolveTaskForFile(host, file);
	if (!task) {
		unmountChrome(view);
		return;
	}

	const done = taskIsDone(task, host.settings);
	let state = mounts.get(view);
	if (!state) {
		state = {component: null, filePath: null};
		mounts.set(view, state);
	}

	let chromeHost = view.contentEl.querySelector(
		":scope > .fulcrum-task-note-chrome",
	) as HTMLElement | null;
	if (!chromeHost) {
		chromeHost = view.contentEl.createDiv({cls: "fulcrum-task-note-chrome"});
		view.contentEl.prepend(chromeHost);
	}

	view.contentEl.classList.add("fulcrum-task-note-doc");

	if (state.component && state.filePath === file.path) {
		state.component.$set({task, done});
		return;
	}

	state.component?.$destroy();
	state.component = new TaskCard({
		target: chromeHost,
		props: {
			plugin: host,
			task,
			done,
			anchorLeaf: view.leaf,
		},
	});
	state.filePath = file.path;
}

function syncAllMarkdownViews(host: FulcrumHost): void {
	for (const leaf of host.app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view;
		if (view instanceof MarkdownView) syncTaskNoteChrome(host, view);
	}
}

export function registerTaskNoteChrome(host: FulcrumHost & Pick<Plugin, "registerEvent">): void {
	let timer: number | undefined;

	function schedule(): void {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => syncAllMarkdownViews(host), 80);
	}

	host.registerEvent(host.app.workspace.on("file-open", schedule));
	host.registerEvent(host.app.workspace.on("layout-change", schedule));
	host.registerEvent(host.app.workspace.on("active-leaf-change", schedule));
	// Metadata fires on every keystroke; refresh task-note chrome after save instead.
	host.registerEvent(
		host.app.vault.on("modify", (f) => {
			if (!(f instanceof TFile) || f.extension !== "md") return;
			for (const leaf of host.app.workspace.getLeavesOfType("markdown")) {
				const view = leaf.view;
				if (view instanceof MarkdownView && view.file?.path === f.path) {
					schedule();
					return;
				}
			}
		}),
	);

	schedule();
}
