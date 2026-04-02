import {
	LAPSE_PLUGIN_ID,
	type LapseQuickStartItemPublic,
	type LapsePublicApi,
} from "@obsidian-suite/interop";
import {Notice, TFile, type App, type Plugin} from "obsidian";

export type {LapseQuickStartItemPublic, LapsePublicApi} from "@obsidian-suite/interop";

type LapsePlugin = Plugin & {api?: LapsePublicApi};

type AppWithPlugins = App & {
	plugins: {getPlugin(id: string): Plugin | null};
};

export function getLapseApi(app: App): LapsePublicApi | undefined {
	return ((app as AppWithPlugins).plugins.getPlugin(LAPSE_PLUGIN_ID) as LapsePlugin | null)?.api;
}

function normalizeLapseProjectRef(s: string | null | undefined): string {
	if (!s) return "";
	const t = s.replace(/\[\[|\]\]/g, "").trim();
	const pipe = t.indexOf("|");
	return (pipe >= 0 ? t.slice(0, pipe) : t).trim();
}

/** Tokens to match against Lapse `project` / `groupValue` (plain names, no extension). */
function projectMatchTokens(app: App, projectName: string, projectFilePath: string): Set<string> {
	const tokens = new Set<string>();
	const n = projectName.trim();
	if (n) tokens.add(n);
	const base = projectFilePath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
	if (base) tokens.add(base);
	const f = app.vault.getAbstractFileByPath(projectFilePath);
	if (f instanceof TFile) {
		const lt = app.metadataCache.fileToLinktext(f, projectFilePath, false);
		if (lt) tokens.add(lt.replace(/\.md$/i, "").trim());
	}
	return tokens;
}

function itemMatchesProject(
	item: LapseQuickStartItemPublic,
	tokens: Set<string>,
	projectFilePath: string,
): boolean {
	if (item.projectSourcePath && item.projectSourcePath === projectFilePath) return true;
	const p = normalizeLapseProjectRef(item.project);
	const g = normalizeLapseProjectRef(item.groupValue);
	for (const t of tokens) {
		if (!t) continue;
		if (p && p === t) return true;
		if (g && g === t) return true;
	}
	return false;
}

function pickFrom(items: LapseQuickStartItemPublic[]): LapseQuickStartItemPublic | null {
	const template = items.find((i) => i.kind === "template");
	if (template) return template;
	const hub = items.find((i) => i.kind === "project");
	return hub ?? null;
}

export type LapsePickResult = {item: LapseQuickStartItemPublic; matchedProject: boolean};

/**
 * Prefer a Quick Start row tied to this Fulcrum project; otherwise first template (generic timer).
 */
export async function pickLapseQuickStartForProject(
	app: App,
	projectName: string,
	projectFilePath: string,
): Promise<LapsePickResult | null> {
	const api = getLapseApi(app);
	if (!api) return null;
	const items = await api.getQuickStartItems();
	if (!items.length) return null;

	const tokens = projectMatchTokens(app, projectName, projectFilePath);
	const matching = items.filter((i) => itemMatchesProject(i, tokens, projectFilePath));
	const specific = pickFrom(matching);
	if (specific) return {item: specific, matchedProject: true};

	const generic = pickFrom(items.filter((i) => i.kind === "template")) ?? pickFrom(items);
	if (generic) return {item: generic, matchedProject: false};

	return null;
}

/**
 * Start Lapse in the open companion note (Lapse appends an empty lapse code fence if missing, then syncs frontmatter).
 * Requires a Lapse build that exposes {@link LapsePublicApi.startTimerInNote}.
 */
export async function runLapseTimerInOpenNote(
	app: App,
	file: TFile,
	meta: { projectLabel: string; entryTitle: string },
): Promise<void> {
	const api = getLapseApi(app);
	if (!api) {
		new Notice("Install and enable Lapse (lapse-tracker) to use timers in notes.");
		return;
	}
	const start = api.startTimerInNote;
	if (typeof start !== "function") {
		new Notice("Update Lapse to the latest version for Fulcrum companion timers.");
		return;
	}
	const projectName = meta.projectLabel.trim();
	try {
		await start(file.path, {
			projectName: projectName || null,
			noteTitle: meta.entryTitle.trim() || null,
		});
	} catch (e) {
		console.error("Fulcrum → Lapse startTimerInNote", e);
		new Notice("Lapse could not start the timer in this note.");
	}
}

export async function runLapseQuickStartForProject(
	app: App,
	projectName: string,
	projectFilePath: string,
): Promise<void> {
	const picked = await pickLapseQuickStartForProject(app, projectName, projectFilePath);
	if (!picked) {
		new Notice("Lapse: no Quick Start items available. Add templates in Lapse settings.");
		return;
	}
	const api = getLapseApi(app);
	if (!api) return;
	try {
		await api.executeQuickStart(picked.item);
	} catch (e) {
		console.error("Fulcrum → Lapse executeQuickStart", e);
		new Notice("Lapse could not start the timer. Check the template and vault paths.");
	}
}
