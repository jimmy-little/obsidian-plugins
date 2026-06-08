import { Notice, TFile } from "obsidian";
import type ReposePlugin from "../main";
import { yamlStringOrStringList } from "../media/mediaModel";

export function appendReadingDateToFrontmatter(
	fm: Record<string, unknown>,
	key: string,
	isoPlay: string,
): void {
	const existing = yamlStringOrStringList(fm[key]);
	if (existing.includes(isoPlay)) {
		fm[key] = existing.length === 1 ? existing[0] : existing;
		return;
	}
	const next = [...existing, isoPlay];
	fm[key] = next.length === 1 ? next[0] : next;
}

async function appendReadingDateNow(
	plugin: ReposePlugin,
	file: TFile,
	key: string,
	notice: string,
): Promise<void> {
	const isoPlay = new Date().toISOString();
	await plugin.app.fileManager.processFrontMatter(file, (fm) => {
		appendReadingDateToFrontmatter(fm, key, isoPlay);
	});
	new Notice(notice);
}

export async function logReadingSession(plugin: ReposePlugin, file: TFile): Promise<void> {
	await appendReadingDateNow(plugin, file, "lastHighlighted", "Logged reading session for today");
}

export async function logCompletedRead(plugin: ReposePlugin, file: TFile): Promise<void> {
	await appendReadingDateNow(plugin, file, "completedRead", "Marked completed read for today");
}
