import {Notice, TFile} from "obsidian";
import {createTaskNoteFile, type CreateTaskNoteOptions} from "./createTaskNote";
import {waitForNextFileResolved} from "./calendar/calendarTaskSchedule";
import type {FulcrumHost} from "./pluginBridge";
import {parseList, parseTaskStatusChoices} from "./settingsDefaults";
import type {IndexedTask} from "./types";
import {openTaskNote} from "./taskNoteActions";
import {
	inlineTaskPlainTitle,
	isInlineTaskLineChecked,
	parseInlinePriority,
	parseInlineTags,
	parseCheckboxLineTitle,
	parseObsidianTasksEmojiDates,
	replaceInlineTaskWithWikilink,
} from "./utils/inlineTasks";
import {resolveInlineTaskProjectFile} from "./utils/projectLink";
import {parseWikiLink} from "./utils/wikilinks";

function buildCreateOptionsFromLine(
	host: FulcrumHost,
	file: TFile,
	rawLine: string,
	projectFile: TFile | null,
	areaFile: TFile | null,
): CreateTaskNoteOptions | null {
	const title = inlineTaskPlainTitle(rawLine);
	if (!title) return null;

	const settings = host.settings;
	const titleBare = parseCheckboxLineTitle(rawLine) ?? "";
	const {dueDate, scheduledDate} = parseObsidianTasksEmojiDates(titleBare);
	const tags = parseInlineTags(titleBare);
	const priority = parseInlinePriority(titleBare);

	const openStatus = parseTaskStatusChoices(settings)[0] ?? "todo";
	const doneStatus = parseList(settings.taskDoneStatuses)[0] ?? "done";
	const checked = isInlineTaskLineChecked(rawLine);
	const status = checked ? doneStatus : openStatus;

	const projectLinks: string[] = [];
	if (projectFile) {
		const lt =
			host.app.metadataCache.fileToLinktext(projectFile, file.path, false) ??
			projectFile.basename.replace(/\.md$/i, "");
		projectLinks.push(`[[${lt}]]`);
	}

	let areaLink: string | null = null;
	if (areaFile) {
		const lt =
			host.app.metadataCache.fileToLinktext(areaFile, file.path, false) ??
			areaFile.basename.replace(/\.md$/i, "");
		areaLink = `[[${lt}]]`;
	}

	return {
		title,
		status,
		priority,
		dueDate: dueDate ?? null,
		scheduledDate: scheduledDate ?? null,
		projectLinks,
		tags,
		areaLink,
	};
}

async function replaceHostLine(
	host: FulcrumHost,
	file: TFile,
	lineNo: number,
	noteBasename: string,
	checked: boolean,
): Promise<void> {
	const content = await host.app.vault.read(file);
	const lines = content.split("\n");
	const rawLine = lines[lineNo] ?? "";
	const nextLine = replaceInlineTaskWithWikilink(rawLine, noteBasename, checked);
	if (!nextLine) throw new Error("Could not replace inline task line");
	lines[lineNo] = nextLine;
	await host.app.vault.modify(file, lines.join("\n"));
}

/** Convert an indexed inline task to a task note; replaces host line with checkbox + wikilink. */
export async function convertInlineTaskToNote(
	host: FulcrumHost,
	task: IndexedTask,
): Promise<TFile | null> {
	if (task.source !== "inline" || task.line == null) {
		new Notice("Only inline tasks can be converted.");
		return null;
	}
	return convertInlineTaskAtLine(host, task.file, task.line, task.projectFile, task.areaFile);
}

/** Convert checkbox at line to task note (works indexed or not). */
export async function convertInlineTaskAtLine(
	host: FulcrumHost,
	file: TFile,
	lineNo: number,
	projectFile: TFile | null = null,
	areaFile: TFile | null = null,
): Promise<TFile | null> {
	const content = await host.app.vault.read(file);
	const lines = content.split("\n");
	const rawLine = lines[lineNo] ?? "";
	if (!rawLine.trim()) {
		new Notice("No task line at cursor.");
		return null;
	}

	let proj = projectFile;
	let area = areaFile;
	if (!proj) {
		const snap = host.vaultIndex.getSnapshot();
		const projectPaths = new Set(snap.projects.map((p) => p.file.path));
		const cache = host.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		proj = resolveInlineTaskProjectFile(
			host.app,
			rawLine,
			file,
			fm,
			projectPaths,
			snap.projects,
			host.settings.projectLinkField,
		);
	}
	if (!area) {
		const cache = host.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		const areaPath = parseWikiLink(fm?.[host.settings.areaLinkField]);
		if (areaPath) {
			const dest = host.app.metadataCache.getFirstLinkpathDest(areaPath, file.path);
			if (dest instanceof TFile) area = dest;
		}
	}

	const opts = buildCreateOptionsFromLine(host, file, rawLine, proj, area);
	if (!opts) {
		new Notice("Enter a task title before converting.");
		return null;
	}

	const checked = isInlineTaskLineChecked(rawLine);
	const created = await createTaskNoteFile(host.app, host.settings, opts);
	if (!created) return null;

	try {
		const basename = created.basename.replace(/\.md$/i, "");
		await replaceHostLine(host, file, lineNo, basename, checked);
		await waitForNextFileResolved(host.app, file);
		await waitForNextFileResolved(host.app, created);
		await host.vaultIndex.rebuild();

		const taskNote: IndexedTask = {
			file: created,
			title: opts.title,
			status: opts.status ?? "",
			projectFile: proj,
			areaFile: area,
			tags: opts.tags ?? [],
			createdAtMs: created.stat.ctime,
			source: "taskNote",
			trackedMinutes: 0,
		};
		openTaskNote(host.app, taskNote);
		new Notice(`Created task note [[${basename}]].`);
		return created;
	} catch (e) {
		console.error(e);
		new Notice("Task note created but could not update the host line.");
		return created;
	}
}
