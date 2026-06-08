import {Menu, Notice, normalizePath, TFile, type App} from "obsidian";
import type {IndexedTask} from "./types";
import {buildObsidianOpenLink} from "../conduit/deepLink";
import type {FulcrumSettings} from "./settingsDefaults";
import {openMarkdownBesideFulcrum, type FulcrumCompanionLeaf} from "./openBesideFulcrum";
import type {WorkspaceLeaf} from "obsidian";

export function copyTextToClipboard(text: string): void {
	void navigator.clipboard.writeText(text).catch(() => {
		new Notice("Could not copy to clipboard.");
	});
}

export function vaultRelativePath(task: IndexedTask): string {
	return task.file.path;
}

export function obsidianLinkForTask(
	app: App,
	settings: FulcrumSettings,
	task: IndexedTask,
): string {
	const path =
		task.source === "inline" && task.line != null
			? `${task.file.path}#${task.line + 1}`
			: task.file.path;
	return buildObsidianOpenLink(app, settings.conduitVaultNameOverride, path);
}

export function openTaskNote(
	app: App,
	task: IndexedTask,
	anchorLeaf?: WorkspaceLeaf,
	companionLeaf?: FulcrumCompanionLeaf,
	newTab = false,
): void {
	const f = app.vault.getAbstractFileByPath(task.file.path);
	if (!(f instanceof TFile)) return;
	const lineState =
		task.source === "inline" && task.line != null
			? {
					state: {line: task.line} as Record<string, unknown>,
					eState: {line: task.line} as Record<string, unknown>,
				}
			: undefined;
	if (newTab) {
		void app.workspace.getLeaf("tab").openFile(f, lineState);
		return;
	}
	if (companionLeaf) {
		void openMarkdownBesideFulcrum(app, anchorLeaf, f, companionLeaf, lineState);
		return;
	}
	void app.workspace.getLeaf(false).openFile(f, lineState);
}

export async function moveTaskNoteFile(
	app: App,
	task: IndexedTask,
	destFolder: string,
): Promise<boolean> {
	if (task.source !== "taskNote") {
		new Notice("Only task notes can be moved.");
		return false;
	}
	const folder = normalizePath(destFolder.trim().replace(/\/+$/, ""));
	if (!folder) {
		new Notice("Choose a destination folder.");
		return false;
	}
	const base = task.file.name;
	const destPath = normalizePath(`${folder}/${base}`);
	if (app.vault.getAbstractFileByPath(destPath)) {
		new Notice("A file already exists at that path.");
		return false;
	}
	try {
		await app.vault.rename(task.file, destPath);
		return true;
	} catch (e) {
		console.error(e);
		new Notice("Could not move task note.");
		return false;
	}
}

export async function mergeTaskNoteInto(
	app: App,
	source: IndexedTask,
	targetPath: string,
): Promise<boolean> {
	if (source.source !== "taskNote") {
		new Notice("Only task notes can be merged.");
		return false;
	}
	const target = app.vault.getAbstractFileByPath(targetPath);
	if (!(target instanceof TFile)) {
		new Notice("Target note not found.");
		return false;
	}
	try {
		const srcBody = await app.vault.read(source.file);
		const fmEnd = srcBody.indexOf("---", 3);
		const bodyOnly = fmEnd >= 0 ? srcBody.slice(fmEnd + 3).trim() : srcBody;
		const targetBody = await app.vault.read(target);
		const merged =
			targetBody.replace(/\s*$/, "") +
			"\n\n---\n\n" +
			`Merged from [[${source.file.basename.replace(/\.md$/i, "")}]]\n\n` +
			bodyOnly +
			"\n";
		await app.vault.modify(target, merged);
		await app.vault.delete(source.file);
		new Notice("Task note merged.");
		return true;
	} catch (e) {
		console.error(e);
		new Notice("Could not merge task notes.");
		return false;
	}
}

export function showCopyPathMenuItem(
	menu: Menu,
	task: IndexedTask,
): void {
	menu.addItem((item) => {
		item.setTitle("Copy path");
		item.setIcon("link");
		item.onClick(() => {
			copyTextToClipboard(vaultRelativePath(task));
			new Notice("Path copied.");
		});
	});
}

export function showCopyObsidianLinkMenuItem(
	menu: Menu,
	app: App,
	settings: FulcrumSettings,
	task: IndexedTask,
): void {
	menu.addItem((item) => {
		item.setTitle("Copy Obsidian link");
		item.setIcon("link-2");
		item.onClick(() => {
			copyTextToClipboard(obsidianLinkForTask(app, settings, task));
			new Notice("Link copied.");
		});
	});
}
