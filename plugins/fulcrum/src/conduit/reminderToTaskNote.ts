import type {App} from "obsidian";
import {Notice, TFile} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject} from "../fulcrum/types";
import {createTaskNoteFile} from "../fulcrum/createTaskNote";
import {openTaskNote} from "../fulcrum/taskNoteActions";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import {readProjectListId} from "./mapping";
import type {FulcrumReminder} from "./types";
import type {RemindersBridge} from "./remindersBridge";

function splitReminderDue(due: string | null): {dueDate?: string; scheduledDate?: string} {
	if (!due?.trim()) return {};
	const d = due.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return {dueDate: d};
	if (/^\d{4}-\d{2}-\d{2}/.test(d)) return {dueDate: d.slice(0, 10), scheduledDate: d.slice(0, 10)};
	return {dueDate: d};
}

export function findProjectByReminderList(
	app: App,
	projects: IndexedProject[],
	settings: FulcrumSettings,
	reminder: FulcrumReminder,
): IndexedProject | null {
	if (reminder.listId) {
		for (const p of projects) {
			const id = readProjectListId(app, p, settings);
			if (id && id === reminder.listId) return p;
		}
	}
	if (reminder.listName) {
		const name = reminder.listName.toLowerCase();
		for (const p of projects) {
			const pname = (p.name || p.file.basename.replace(/\.md$/i, "")).toLowerCase();
			if (pname === name) return p;
		}
	}
	return null;
}

export async function createTaskNoteFromReminder(
	host: FulcrumHost,
	bridge: RemindersBridge,
	reminder: FulcrumReminder,
	projectOverride?: IndexedProject | null,
): Promise<TFile | null> {
	const snap = host.vaultIndex.getSnapshot();
	const project =
		projectOverride ??
		findProjectByReminderList(host.app, snap.projects, host.settings, reminder);

	const dates = splitReminderDue(reminder.dueDate);
	const tags = reminder.tags.map((t) => (t.startsWith("#") ? t : `#${t}`));

	let projectLinks: string[] | undefined;
	let areaLink: string | null = null;
	if (project) {
		const lt =
			host.app.metadataCache.fileToLinktext(project.file, project.file.path, false) ??
			project.file.basename.replace(/\.md$/i, "");
		projectLinks = [`[[${lt}]]`];
		if (project.areaFiles[0]) {
			const area = project.areaFiles[0];
			const alt =
				host.app.metadataCache.fileToLinktext(area, project.file.path, false) ??
				area.basename.replace(/\.md$/i, "");
			areaLink = `[[${alt}]]`;
		}
	}

	const file = await createTaskNoteFile(host.app, host.settings, {
		title: reminder.title,
		dueDate: dates.dueDate ?? null,
		scheduledDate: dates.scheduledDate ?? null,
		projectLinks,
		tags: tags.length > 0 ? tags : undefined,
		areaLink,
	});

	if (!file) return null;

	if (reminder.notes.trim()) {
		const body = reminder.notes.trim();
		const existing = await host.app.vault.read(file);
		await host.app.vault.modify(file, `${existing.trimEnd()}\n\n${body}\n`);
	}

	try {
		await bridge.deleteReminder(reminder.id);
	} catch (e) {
		console.error("Could not delete source reminder", e);
		new Notice("Task note created, but the Reminder could not be deleted.");
	}

	await host.vaultIndex.rebuild();
	const createdTask: import("../fulcrum/types").IndexedTask = {
		file,
		title: reminder.title,
		status: host.settings.taskStatuses.split(",")[0]?.trim() ?? "todo",
		projectFile: project?.file ?? null,
		areaFile: project?.areaFiles[0] ?? null,
		tags: reminder.tags,
		createdAtMs: file.stat.ctime,
		source: "taskNote",
		trackedMinutes: 0,
	};
	openTaskNote(host.app, createdTask);
	new Notice(`Created task note from Reminder: ${reminder.title}`);
	return file;
}
