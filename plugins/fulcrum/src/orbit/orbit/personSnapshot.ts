import type {App} from "obsidian";
import {TFile} from "obsidian";
import {addDays, startOfLocalDay, toISODateLocal} from "@obsidian-suite/heatmap";
import {readPersonFrontmatter, displayNameForPerson, formatPersonWorkLocationLine} from "./personModel";
import {
	collectInteractions,
	mergeActivityFeed,
	quickNoteEntriesFromPersonBody,
	type InteractionEntry,
} from "./interactions";
import {computePersonStats, type PersonStatsTiles} from "./stats";
import {resolveWikiPath, wikiLinkPathsFromText} from "./orgLinks";
import type {OrbitSettings} from "./settings";

export const SNAPSHOT_END_MARKER = "<!-- orbit-snapshot-end -->";

function todayLocalISODate(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function escapeTableCell(s: string): string {
	return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function fmtSnapshotDate(ms: number | null): string {
	if (ms == null) return "—";
	try {
		return new Date(ms).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return "—";
	}
}

function fmtActivityWhenSnapshot(row: InteractionEntry): string {
	try {
		if (row.showTimeInFeed) {
			return new Date(row.dateMs).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
				hour: "numeric",
				minute: "2-digit",
			});
		}
		return new Date(row.dateMs).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return "—";
	}
}

function kindLabel(row: InteractionEntry): string {
	if (row.kind === "quick") return "Quick note";
	if (row.kind === "meeting") return "Meeting";
	if (row.kind === "call") return "Call";
	return "Note";
}

/** Distinct local days in the last ~365 days with ≥1 interaction (matches heatmap range). */
function heatmapActiveDayCount(activity: InteractionEntry[], nowMs: number): number {
	const rangeEnd = startOfLocalDay(new Date(nowMs));
	const rangeStart = addDays(rangeEnd, -364);
	const days = new Set<string>();
	for (const a of activity) {
		const dayStart = startOfLocalDay(new Date(a.dateMs));
		if (dayStart.getTime() >= rangeStart.getTime() && dayStart.getTime() <= rangeEnd.getTime()) {
			days.add(toISODateLocal(new Date(a.dateMs)));
		}
	}
	return days.size;
}

export type PersonSnapshotData = {
	displayName: string;
	workLocationLine: string;
	stats: PersonStatsTiles;
	activity: InteractionEntry[];
	orgUp: {path: string; displayName: string}[];
	orgDown: {path: string; displayName: string}[];
	heatmapActiveDays: number;
};

export async function gatherPersonSnapshotData(
	app: App,
	personFile: TFile,
	settings: OrbitSettings,
	nowMs: number = Date.now(),
): Promise<PersonSnapshotData | null> {
	const cache = app.metadataCache.getFileCache(personFile);
	const fm = readPersonFrontmatter(cache);
	const displayName = displayNameForPerson(fm, personFile.basename);
	const workLocationLine = formatPersonWorkLocationLine(fm);

	const orgUp: {path: string; displayName: string}[] = [];
	for (const lt of wikiLinkPathsFromText(typeof fm.org_up === "string" ? fm.org_up : undefined)) {
		const p = resolveWikiPath(app, lt, personFile);
		if (!p) continue;
		const pf = app.vault.getAbstractFileByPath(p);
		if (pf instanceof TFile) {
			const c = app.metadataCache.getFileCache(pf);
			const ofm = readPersonFrontmatter(c);
			orgUp.push({path: p, displayName: displayNameForPerson(ofm, pf.basename)});
		}
	}

	const orgDown: {path: string; displayName: string}[] = [];
	const downRaw = fm.org_down;
	let downList: string[] = [];
	if (typeof downRaw === "string") downList = wikiLinkPathsFromText(downRaw);
	else if (Array.isArray(downRaw)) {
		for (const x of downRaw) downList.push(...wikiLinkPathsFromText(String(x)));
	}
	for (const lt of downList) {
		const p = resolveWikiPath(app, lt, personFile);
		if (!p) continue;
		const pf = app.vault.getAbstractFileByPath(p);
		if (pf instanceof TFile) {
			const c = app.metadataCache.getFileCache(pf);
			const ofm = readPersonFrontmatter(c);
			orgDown.push({path: p, displayName: displayNameForPerson(ofm, pf.basename)});
		}
	}

	let body: string;
	try {
		body = await app.vault.read(personFile);
	} catch {
		return null;
	}

	const back = await collectInteractions(app, personFile, settings);
	const quick = quickNoteEntriesFromPersonBody(personFile, body);
	const activity = mergeActivityFeed(back, quick);
	const stats = computePersonStats(activity, nowMs);
	const heatmapActiveDays = heatmapActiveDayCount(activity, nowMs);

	return {
		displayName,
		workLocationLine,
		stats,
		activity,
		orgUp,
		orgDown,
		heatmapActiveDays,
	};
}

/**
 * Static markdown for export: stats, org, heatmap summary, activity (newest first, capped).
 */
export function buildPersonSnapshotMarkdown(app: App, personPath: string, data: PersonSnapshotData): string {
	const lines: string[] = [];
	const {stats} = data;

	lines.push(`_Exported for ${escapeTableCell(data.displayName)}${data.workLocationLine ? ` · ${escapeTableCell(data.workLocationLine)}` : ""}_`);
	lines.push("");

	lines.push("| Last contacted | Total | This month | Avg cadence | First contact | Month streak |");
	lines.push("| --- | --- | --- | --- | --- | --- |");
	lines.push(
		`| ${fmtSnapshotDate(stats.lastContacted)} | ${stats.totalInteractions} | ${stats.thisMonth} | ${stats.avgCadenceDays != null ? `${stats.avgCadenceDays} days` : "—"} | ${fmtSnapshotDate(stats.firstContact)} | ${stats.monthStreak} |`,
	);
	lines.push("");
	lines.push(`**Last-year activity map:** ${data.heatmapActiveDays} distinct days with ≥1 interaction (rolling ~365 days).`);
	lines.push("");

	if (data.orgUp.length > 0 || data.orgDown.length > 0) {
		lines.push("### Org");
		if (data.orgUp.length > 0) {
			lines.push("- **Reports to**");
			for (const o of data.orgUp) {
				const pf = app.vault.getAbstractFileByPath(o.path);
				const linkText =
					pf instanceof TFile
						? (app.metadataCache.fileToLinktext(pf, personPath, true) ?? o.displayName)
						: o.displayName;
				lines.push(`  - [[${linkText}|${escapeTableCell(o.displayName)}]]`);
			}
		}
		if (data.orgDown.length > 0) {
			lines.push("- **Direct reports**");
			for (const o of data.orgDown) {
				const pf = app.vault.getAbstractFileByPath(o.path);
				const linkText =
					pf instanceof TFile
						? (app.metadataCache.fileToLinktext(pf, personPath, true) ?? o.displayName)
						: o.displayName;
				lines.push(`  - [[${linkText}|${escapeTableCell(o.displayName)}]]`);
			}
		}
		lines.push("");
	}

	const limit = 80;
	const act = data.activity.slice(0, limit);
	if (act.length > 0) {
		lines.push("### Activity");
		for (const row of act) {
			const when = fmtActivityWhenSnapshot(row);
			const kind = kindLabel(row);
			const f = row.file;
			const linkText =
				app.metadataCache.fileToLinktext(f, personPath, true) ?? f.basename.replace(/\.md$/i, "");
			const displayTitle = (row.kind === "quick" ? "Quick note" : row.title)
				.replace(/\n/g, " ")
				.replace(/\|/g, "·")
				.replace(/]/g, "");
			const link = `[[${linkText}|${displayTitle}]]`;
			let detail = "";
			if (row.kind === "quick" && row.quickBody) {
				const q = row.quickBody.replace(/\n/g, " ").slice(0, 220);
				detail = row.quickBody.length > 220 ? `${q}…` : q;
			}
			const meta = detail ? ` — ${detail}` : "";
			lines.push(`- **${when}** — ${link} (${kind})${meta}`);
		}
		if (data.activity.length > limit) {
			lines.push(`- *…and ${data.activity.length - limit} more entries not listed*`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

/** Full fenced block: opening comment (timestamp id), body, footer line, end comment. */
export function buildFullOrbitSnapshotBlock(body: string): string {
	const ts = Date.now();
	const iso = todayLocalISODate();
	const header = `<!-- orbit-snapshot:${ts} -->`;
	const title = `### Person Snapshot (${iso})`;
	const footer = "_Snapshot captured by Orbit_";
	return `${header}\n\n${title}\n\n${body.trimEnd()}\n\n${footer}\n${SNAPSHOT_END_MARKER}`;
}

/**
 * Replace prior snapshot region or append a new one. Does not modify text outside the fences.
 */
export async function insertOrReplacePersonSnapshot(app: App, personFile: TFile, fullBlock: string): Promise<void> {
	const body = await app.vault.read(personFile);
	const startMarker = "<!-- orbit-snapshot";
	const startIdx = body.indexOf(startMarker);
	const endIdx = body.indexOf(SNAPSHOT_END_MARKER);

	let newBody: string;
	if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
		const lineStart = body.lastIndexOf("\n", startIdx) + 1;
		const afterFooter = body.indexOf("\n", endIdx + SNAPSHOT_END_MARKER.length);
		const lineEnd = afterFooter === -1 ? body.length : afterFooter + 1;
		const before = body.slice(0, lineStart).trimEnd();
		const after = body.slice(lineEnd).trimStart();
		newBody = [before, fullBlock, after].filter(Boolean).join("\n\n");
	} else {
		const trimmed = body.replace(/\s*$/, "");
		newBody = trimmed ? `${trimmed}\n\n${fullBlock}` : fullBlock;
	}

	await app.vault.modify(personFile, newBody);
}
