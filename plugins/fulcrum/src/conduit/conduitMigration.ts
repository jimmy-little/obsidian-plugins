import {App, Modal, Notice, Platform} from "obsidian";
import type FulcrumPlugin from "../main";
import {readProjectListId} from "./mapping";
import {areaTagForProject} from "./projectMeta";
import {createRemindersBridge, createRemctlBridge} from "./remindersBridge";
import type {FulcrumReminder} from "./types";

const LEGACY_REMINDER_ID_FIELD = "appleReminderId";
const LEGACY_PROJECT_SYNC_FIELD = "conduitSync";
const INLINE_REMINDER_ID_COMMENT = /<!--\s*reminder-id:\s*\d+\s*-->/i;

export const CONDUIT_CONVERT_NOTICE_KEY = "conduitConvertNoticeShown";

export function wasLegacyConduitUser(raw: Record<string, unknown> | null): boolean {
	if (!raw) return false;
	if (raw.conduitEnabled === true) return true;
	return (
		raw.conduitSync != null ||
		raw.conduitEntityState != null ||
		raw.conduitSyncOverrides != null ||
		raw.conduitProjectListPairs != null ||
		raw.conduitImportUnmapped != null ||
		typeof raw.conduitReminderIdField === "string" ||
		typeof raw.conduitSyncField === "string"
	);
}

class ConduitConvertNoticeModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const {contentEl, titleEl} = this;
		titleEl.setText("Reminders bridge: convert model");
		contentEl.createEl("p", {
			text: "Fulcrum no longer mirrors tasks into Apple Reminders. Tasks live in Obsidian or Reminders — not both.",
		});
		contentEl.createEl("p", {
			text: "Use fulcrum-reminders query blocks for live Reminders views, and convert actions to move tasks between vault and Reminders.",
		});
		contentEl.createEl("p", {
			text: "Optional: run Reminders → Clean up legacy Conduit metadata in vault / Reminders from the command palette.",
			cls: "fulcrum-muted",
		});
		const row = contentEl.createDiv({cls: "modal-button-container"});
		row.createEl("button", {text: "Got it", cls: "mod-cta"}).addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export async function maybeShowConduitConvertNotice(
	plugin: FulcrumPlugin,
	raw: Record<string, unknown> | null,
): Promise<void> {
	if (!Platform.isMacOS) return;
	if (plugin.conduitConvertNoticeShown) return;
	if (!wasLegacyConduitUser(raw)) return;
	plugin.conduitConvertNoticeShown = true;
	await plugin.savePluginMeta();
	new ConduitConvertNoticeModal(plugin.app).open();
}

export function cleanConduitReminderNotes(notes: string): string {
	let text = notes.replace(/\r\n/g, "\n");
	text = text.replace(/obsidian:\/\/[^\s)]+/gi, "");
	text = text
		.split("\n")
		.filter((line) => !/^Open in Obsidian\s*$/i.test(line.trim()))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return text;
}

function reminderHasConduitMetadata(rem: FulcrumReminder, areaTags: Set<string>): boolean {
	if (/obsidian:\/\//i.test(rem.notes)) return true;
	if (/^Open in Obsidian\s*$/im.test(rem.notes)) return true;
	return rem.tags.some((t) => areaTags.has(t.toLowerCase()));
}

export interface VaultConduitCleanupResult {
	taskNotesCleared: number;
	inlineCommentsCleared: number;
	projectSyncFieldsCleared: number;
}

export async function cleanupVaultConduitMetadata(
	plugin: FulcrumPlugin,
): Promise<VaultConduitCleanupResult> {
	const app = plugin.app;
	const snap = plugin.vaultIndex.getSnapshot();
	const touchedTaskNotes = new Set<string>();
	let taskNotesCleared = 0;
	let inlineCommentsCleared = 0;
	let projectSyncFieldsCleared = 0;

	for (const task of snap.tasks) {
		if (task.source === "taskNote") {
			const cache = app.metadataCache.getFileCache(task.file);
			const fm = cache?.frontmatter as Record<string, unknown> | undefined;
			if (!fm || !(LEGACY_REMINDER_ID_FIELD in fm)) continue;
			if (touchedTaskNotes.has(task.file.path)) continue;
			await app.fileManager.processFrontMatter(task.file, (next) => {
				delete next[LEGACY_REMINDER_ID_FIELD];
			});
			touchedTaskNotes.add(task.file.path);
			taskNotesCleared++;
		} else if (task.source === "inline" && task.line != null) {
			const content = await app.vault.read(task.file);
			const lines = content.split("\n");
			const line = lines[task.line];
			if (!line || !INLINE_REMINDER_ID_COMMENT.test(line)) continue;
			lines[task.line] = line.replace(INLINE_REMINDER_ID_COMMENT, "").trimEnd();
			await app.vault.modify(task.file, lines.join("\n"));
			inlineCommentsCleared++;
		}
	}

	for (const file of app.vault.getMarkdownFiles()) {
		if (touchedTaskNotes.has(file.path)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
		if (!fm || !(LEGACY_REMINDER_ID_FIELD in fm)) continue;
		await app.fileManager.processFrontMatter(file, (next) => {
			delete next[LEGACY_REMINDER_ID_FIELD];
		});
		touchedTaskNotes.add(file.path);
		taskNotesCleared++;
	}

	for (const project of snap.projects) {
		const fm = app.metadataCache.getFileCache(project.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		if (!fm || !(LEGACY_PROJECT_SYNC_FIELD in fm)) continue;
		await app.fileManager.processFrontMatter(project.file, (next) => {
			delete next[LEGACY_PROJECT_SYNC_FIELD];
		});
		projectSyncFieldsCleared++;
	}

	await plugin.refreshIndex();
	return {taskNotesCleared, inlineCommentsCleared, projectSyncFieldsCleared};
}

export async function cleanupRemindersConduitMetadata(
	plugin: FulcrumPlugin,
): Promise<{updated: number; scanned: number}> {
	if (!Platform.isMacOS) {
		throw new Error("Reminders cleanup is macOS only.");
	}
	if (!plugin.settings.conduitEnabled) {
		throw new Error("Enable the Reminders bridge in Fulcrum settings first.");
	}

	const bridge = await createRemindersBridge(plugin.settings);
	const remctlBridge = createRemctlBridge(plugin.settings);

	const app = plugin.app;
	const settings = plugin.settings;
	const projects = plugin.vaultIndex.getSnapshot().projects;
	const linkedListIds = new Set<string>();
	const areaTags = new Set<string>();

	for (const project of projects) {
		const listId = readProjectListId(app, project, settings);
		if (listId) linkedListIds.add(listId);
		const tag = areaTagForProject(project);
		if (tag) areaTags.add(tag.toLowerCase());
	}

	const reminders = await bridge.fetchAllReminders();
	let updated = 0;
	let scanned = 0;

	for (const rem of reminders) {
		if (linkedListIds.size > 0 && rem.listId && !linkedListIds.has(rem.listId)) continue;
		scanned++;
		if (!reminderHasConduitMetadata(rem, areaTags)) continue;

		const nextNotes = cleanConduitReminderNotes(rem.notes);
		const nextTags = rem.tags.filter((t) => !areaTags.has(t.toLowerCase()));
		const patch: {notes?: string; tags?: string[]} = {};
		if (nextNotes !== rem.notes) patch.notes = nextNotes;
		if (nextTags.length !== rem.tags.length) patch.tags = nextTags;
		if (Object.keys(patch).length === 0) continue;

		const editor = patch.tags ? remctlBridge : bridge;
		await editor.editReminder!(rem.id, patch);
		updated++;
	}

	return {updated, scanned};
}

export function registerConduitMigrationCommands(plugin: FulcrumPlugin): void {
	if (!Platform.isMacOS) return;

	plugin.addCommand({
		id: "conduit-cleanup-vault-metadata",
		name: "Reminders: Clean up legacy Conduit metadata in vault",
		callback: () => {
			void (async () => {
				try {
					const result = await cleanupVaultConduitMetadata(plugin);
					const total =
						result.taskNotesCleared +
						result.inlineCommentsCleared +
						result.projectSyncFieldsCleared;
					if (total === 0) {
						new Notice("No legacy Conduit metadata found in the vault.");
						return;
					}
					new Notice(
						`Removed legacy Conduit metadata (${result.taskNotesCleared} task notes, ${result.inlineCommentsCleared} inline lines, ${result.projectSyncFieldsCleared} projects).`,
					);
				} catch (e) {
					console.error(e);
					new Notice("Could not clean up vault Conduit metadata.");
				}
			})();
		},
	});

	plugin.addCommand({
		id: "conduit-cleanup-reminders-metadata",
		name: "Reminders: Clean up Conduit metadata in Reminders",
		checkCallback: (checking) => {
			if (!plugin.settings.conduitEnabled) return false;
			if (!checking) {
				void (async () => {
					try {
						const {updated, scanned} = await cleanupRemindersConduitMetadata(plugin);
						if (updated === 0) {
							new Notice(
								scanned > 0
									? `Scanned ${scanned} reminders — no Conduit metadata to remove.`
									: "No reminders in linked project lists.",
							);
							return;
						}
						new Notice(`Cleaned Conduit metadata from ${updated} reminder(s).`);
					} catch (e) {
						console.error(e);
						const msg = e instanceof Error ? e.message : String(e);
						new Notice(msg.length < 120 ? msg : "Could not clean up Reminders metadata.");
					}
				})();
			}
			return true;
		},
	});
}
