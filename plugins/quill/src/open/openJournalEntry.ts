import { TFile, type App } from "obsidian";
import { getPluginApi, PLUGIN_IDS } from "@obsidian-suite/core";
import type { JournalEntry } from "../journal";
import type { EntryOpenIn, QuillSettings } from "../settings";

type PulseOpenApi = {
	openWorkoutDocumentLeaf?: (notePath: string) => Promise<void>;
	openNutritionDayView?: (date: string) => Promise<void>;
};

type FulcrumVaultIndex = {
	resolveProjectByPath?: (path: string) => { file: TFile } | undefined;
};

type FulcrumOpenApi = {
	openProjectSummary?: (path: string) => Promise<void>;
	openLinkedNoteFromFulcrum?: (path: string) => void;
	vaultIndex?: FulcrumVaultIndex;
	settings?: { projectLinkField?: string };
};

function stripWikilink(raw: string): string | null {
	const m = raw.match(/^\[\[(?:[^\]|]+\|)?([^\]]+)\]\]$/);
	if (m) return m[1]!.trim();
	const t = raw.trim();
	return t.length > 0 ? t : null;
}

function resolveProjectPathFromFrontmatter(
	app: App,
	file: TFile,
	linkKey: string,
): string | null {
	const front = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!front) return null;
	const raw = front[linkKey.trim()];
	if (typeof raw !== "string" || !raw.trim()) return null;
	const link =
		stripWikilink(raw.trim()) ??
		(raw.trim() && !raw.includes("[[") ? raw.trim() : null);
	if (!link) return null;
	const dest = app.metadataCache.getFirstLinkpathDest(link, file.path);
	return dest instanceof TFile ? dest.path : null;
}

function resolveOpenIn(entry: JournalEntry, settings: QuillSettings): EntryOpenIn {
	const typeName = entry.entryType?.trim();
	if (!typeName) return "markdown";
	const row = (settings.entryTypes ?? []).find(
		(t) => t.name.trim().toLowerCase() === typeName.toLowerCase(),
	);
	return row?.openIn ?? "markdown";
}

async function openMarkdownEntry(app: App, entry: JournalEntry): Promise<void> {
	const leaf = app.workspace.getLeaf(false);
	if (entry.sourceLine != null) {
		await leaf.openFile(entry.file, { eState: { line: entry.sourceLine } });
		return;
	}
	await leaf.openFile(entry.file);
}

async function tryOpenPulseWorkout(app: App, entry: JournalEntry): Promise<boolean> {
	const pulse = getPluginApi(app, PLUGIN_IDS.pulse) as PulseOpenApi | null;
	if (!pulse?.openWorkoutDocumentLeaf) return false;
	await pulse.openWorkoutDocumentLeaf(entry.file.path);
	return true;
}

async function tryOpenPulseNutritionDay(app: App, entry: JournalEntry): Promise<boolean> {
	const pulse = getPluginApi(app, PLUGIN_IDS.pulse) as PulseOpenApi | null;
	if (!pulse?.openNutritionDayView) return false;
	await pulse.openNutritionDayView(entry.date);
	return true;
}

async function tryOpenFulcrumMeeting(
	app: App,
	entry: JournalEntry,
	settings: QuillSettings,
): Promise<boolean> {
	const fulcrum = getPluginApi(app, PLUGIN_IDS.fulcrum) as FulcrumOpenApi | null;
	if (!fulcrum) return false;

	const linkKey =
		fulcrum.settings?.projectLinkField?.trim() ||
		settings.projectLinkProperty?.trim() ||
		"project";
	const projectPath = resolveProjectPathFromFrontmatter(app, entry.file, linkKey);

	if (projectPath && fulcrum.openProjectSummary) {
		const indexed = fulcrum.vaultIndex?.resolveProjectByPath?.(projectPath);
		if (indexed?.file.path) {
			await fulcrum.openProjectSummary(indexed.file.path);
			return true;
		}
		await fulcrum.openProjectSummary(projectPath);
		return true;
	}

	if (fulcrum.openLinkedNoteFromFulcrum) {
		fulcrum.openLinkedNoteFromFulcrum(entry.file.path);
		return true;
	}

	return false;
}

async function tryOpenFulcrumNote(app: App, entry: JournalEntry): Promise<boolean> {
	const fulcrum = getPluginApi(app, PLUGIN_IDS.fulcrum) as FulcrumOpenApi | null;
	if (!fulcrum?.openLinkedNoteFromFulcrum) return false;
	fulcrum.openLinkedNoteFromFulcrum(entry.file.path);
	return true;
}

/** Route entry open to Pulse/Fulcrum when configured and available; else markdown. */
export async function openJournalEntry(
	app: App,
	entry: JournalEntry,
	settings: QuillSettings,
): Promise<void> {
	const openIn = resolveOpenIn(entry, settings);

	switch (openIn) {
		case "pulse-workout":
			if (await tryOpenPulseWorkout(app, entry)) return;
			break;
		case "pulse-nutrition-day":
			if (await tryOpenPulseNutritionDay(app, entry)) return;
			break;
		case "fulcrum-meeting":
			if (await tryOpenFulcrumMeeting(app, entry, settings)) return;
			break;
		case "fulcrum-note":
			if (await tryOpenFulcrumNote(app, entry)) return;
			break;
		case "markdown":
		default:
			break;
	}

	await openMarkdownEntry(app, entry);
}
