import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	Notice: class Notice {},
	Platform: {isMacOS: true},
	TFile: class TFile {},
	MarkdownView: class MarkdownView {},
	requestUrl: vi.fn(),
}));

let createdFiles = 0;
vi.mock("../../fulcrum/createTaskNote", () => ({
	createTaskNoteFile: vi.fn(async () => {
		createdFiles += 1;
		return {path: `35 Tasks/TaskNotes/note-${createdFiles}.md`, basename: `note-${createdFiles}`, stat: {mtime: 0}};
	}),
}));
vi.mock("../../fulcrum/kanban/taskFieldUpdate", () => ({updateTaskNoteField: vi.fn(async () => {})}));

const client = {
	reminders: [] as import("../types").FulcrumReminder[],
	fetchReminders: vi.fn(async () => client.reminders),
	revision: vi.fn(async () => 1),
	lists: vi.fn(async () => []),
	create: vi.fn(async () => `R-new-${client.create.mock.calls.length}`),
	get: vi.fn(async (id: string): Promise<never> => {
		throw new Error(`Reminder not found (/reminders/${id}).`);
	}),
	update: vi.fn(async () => {}),
};
vi.mock("../remindersBridge", () => ({HttpRemindersBridge: {fromSettings: () => client}}));

import {DEFAULT_SETTINGS} from "../../fulcrum/settingsDefaults";
import type {IndexedTask} from "../../fulcrum/types";
import {RemindersSyncService} from "../syncService";

const LIST = "LIST-1";
const project = {file: {path: "40 Projects/P.md", basename: "P"}} as never;

function reminder(id: string): import("../types").FulcrumReminder {
	return {id, title: `Task ${id}`, completed: false, dueDate: null, notes: "", listId: LIST, tags: []};
}

/** Plugin whose index snapshot and metadata cache never catch up with writes. */
function stalePlugin(tasks: IndexedTask[] = []) {
	const plugin = {
		settings: {...DEFAULT_SETTINGS, conduitEnabled: true},
		saveSettings: vi.fn(async () => {}),
		vaultIndex: {
			getSnapshot: () => ({rebuiltAt: 1, projects: [project], tasks}),
			rebuild: vi.fn(async () => {}),
		},
		app: {
			metadataCache: {getFileCache: () => ({}), fileToLinktext: () => "P"},
			fileManager: {processFrontMatter: vi.fn(async () => {})},
		},
	};
	return plugin;
}

function service(plugin: ReturnType<typeof stalePlugin>) {
	const svc = new RemindersSyncService(plugin as never);
	svc.rememberLinkedList("40 Projects/P.md", LIST);
	return svc;
}

beforeEach(() => {
	createdFiles = 0;
	client.reminders = [];
	vi.clearAllMocks();
});

describe("RemindersSyncService duplicate guard", () => {
	it("imports a reminder once even when the index never shows the new note", async () => {
		client.reminders = [reminder("R1")];
		const svc = service(stalePlugin());
		await svc.tick();
		await svc.tick();
		await svc.tick();
		expect(createdFiles).toBe(1);
		expect(client.create).not.toHaveBeenCalled();
	});

	it("does not push a new reminder for a note whose id write has not reached the cache", async () => {
		client.reminders = [reminder("R1")];
		const tasks: IndexedTask[] = [];
		const plugin = stalePlugin(tasks);
		const svc = service(plugin);
		await svc.tick();
		// Index now sees the created note, but frontmatter still lacks the reminder id.
		tasks.push({
			source: "taskNote",
			file: {path: "35 Tasks/TaskNotes/note-1.md", stat: {mtime: 0}},
			title: "Task R1",
			status: "NONE",
			projectFile: {path: "40 Projects/P.md"},
		} as never);
		await svc.tick();
		expect(client.create).not.toHaveBeenCalled();
		expect(createdFiles).toBe(1);
	});

	it("leaves a note alone when its linked reminder was deleted", async () => {
		const plugin = stalePlugin([
			{
				source: "taskNote",
				file: {path: "35 Tasks/TaskNotes/old.md", stat: {mtime: 0}},
				title: "Old",
				status: "NONE",
				projectFile: {path: "40 Projects/P.md"},
			} as never,
		]);
		plugin.app.metadataCache.getFileCache = () => ({frontmatter: {appleReminderId: "GONE-1"}});
		const summary = await service(plugin).tick();
		expect(client.create).not.toHaveBeenCalled();
		expect(summary?.orphaned).toBe(1);
	});

	it("turns sync off when one pass would create too many items", async () => {
		client.reminders = Array.from({length: 40}, (_, i) => reminder(`R${i}`));
		const plugin = stalePlugin();
		const summary = await service(plugin).tick();
		expect(summary).toBeNull();
		expect(createdFiles).toBe(25);
		expect(plugin.settings.conduitEnabled).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});
