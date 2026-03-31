import {TFile, type App} from "obsidian";
import type {ProjectLogActivityEntry} from "./projectNote";
import type {FulcrumSettings} from "./settingsDefaults";
import type {ProjectRollup} from "./types";
import {todayLocalISODate} from "./utils/dates";
import {formatTrackedMinutesShort} from "./utils/dates";
import {parseList} from "./settingsDefaults";
import {
	incompleteProjectTasks,
	sortMsForMeeting,
	taskIsComplete,
} from "./utils/projectActivity";

export const SNAPSHOT_HEADER_PREFIX = "## Project Snapshot (";
export const SNAPSHOT_FOOTER = "<!-- Fulcrum snapshot end -->";

/** Build the markdown body for a project snapshot (stats, tasks, meetings, activity). */
export function buildSnapshotMarkdown(
	app: App,
	projectPath: string,
	rollup: ProjectRollup,
	logEntries: ProjectLogActivityEntry[],
	s: FulcrumSettings,
): string {
	const doneTask = new Set(parseList(s.taskDoneStatuses));
	const openTasks = incompleteProjectTasks(rollup.tasks, doneTask);
	const timeTracked = formatTrackedMinutesShort(rollup.aggregatedTrackedMinutes) || "0m";

	const lines: string[] = [];

	// Stats table
	lines.push("| Time tracked | Completed | Open tasks | Notes |");
	lines.push("| --- | --- | --- | --- |");
	lines.push(
		`| ${timeTracked} | ${rollup.doneTasks} / ${rollup.totalTasks} | ${rollup.openTasks} | ${rollup.atomicNotes.length} |`,
	);
	lines.push("");

	// Tasks table
	if (rollup.tasks.length > 0) {
		lines.push("### Tasks");
		lines.push("| Task | Status | Due | Link |");
		lines.push("| --- | --- | --- | --- |");
		for (const t of [...openTasks, ...rollup.tasks.filter((x) => taskIsComplete(x, doneTask))]) {
			const linkText =
				app.metadataCache.fileToLinktext(t.file, projectPath, true) ??
				t.file.basename.replace(/\.md$/i, "");
			const fragment = t.line != null ? `#L${t.line + 1}` : "";
			const display = escapeTablePipe(t.title || "Task");
			const link = `[[${linkText}${fragment}\\|${display}]]`;
			lines.push(
				`| ${display} | ${t.status} | ${t.dueDate?.slice(0, 10) ?? "—"} | ${link} |`,
			);
		}
		lines.push("");
	}

	// Meetings table
	if (rollup.meetings.length > 0) {
		lines.push("### Meetings");
		lines.push("| Date | Title | Duration | Link |");
		lines.push("| --- | --- | --- | --- |");
		for (const m of rollup.meetings) {
			const linkText =
				app.metadataCache.fileToLinktext(m.file, projectPath, true) ??
				m.file.basename.replace(/\.md$/i, "");
			const dur =
				m.totalMinutesTracked != null && m.totalMinutesTracked > 0
					? formatTrackedMinutesShort(m.totalMinutesTracked)
					: m.duration != null
						? `${m.duration}m`
						: "—";
			const title = m.title?.trim() || m.file.basename.replace(/\.md$/i, "");
			const display = escapeTablePipe(title);
			lines.push(
				`| ${m.date?.slice(0, 10) ?? "—"} | ${display} | ${dur} | [[${linkText}\\|${display}]] |`,
			);
		}
		lines.push("");
	}

	// Related people
	if (rollup.relatedPeople?.length > 0) {
		lines.push("### Related people");
		for (const p of rollup.relatedPeople) {
			const linkText =
				app.metadataCache.fileToLinktext(p.file, projectPath, true) ??
				p.file.basename.replace(/\.md$/i, "");
			const display = stripWikilinkForDisplay(p.name);
			lines.push(`- [[${linkText}|${display}]]`);
		}
		lines.push("");
	}

	// Activity stream (newest first) — build from raw data to get stampLabel for log entries
	type ActItem = {
		sortMs: number;
		title: string;
		stampLabel: string;
		hoverPath?: string;
		chips: string[];
	};
	const actItems: ActItem[] = [];
	for (const n of rollup.atomicNotes) {
		const title = n.entryTitle?.trim() || n.file.basename.replace(/\.md$/i, "") || "Note";
		if (!title || title === "null") continue;
		const chips: string[] = [];
		if (n.dateDisplay) chips.push(n.dateDisplay);
		if (n.trackedMinutes > 0)
			chips.push(formatTrackedMinutesShort(n.trackedMinutes));
		actItems.push({
			sortMs: n.modifiedMs,
			title,
			stampLabel: "",
			hoverPath: n.file.path,
			chips,
		});
	}
	for (const t of rollup.tasks) {
		if (!taskIsComplete(t, doneTask)) continue;
		const title = t.title?.trim() || "Task";
		if (title === "null") continue;
		const chips: string[] = [t.status];
		if (t.dueDate) chips.push(`due ${t.dueDate.slice(0, 10)}`);
		if (t.trackedMinutes > 0)
			chips.push(formatTrackedMinutesShort(t.trackedMinutes));
		actItems.push({
			sortMs: t.file.stat.mtime,
			title,
			stampLabel: "",
			hoverPath: t.file.path,
			chips,
		});
	}
	for (const m of rollup.meetings) {
		const title = m.title?.trim() || m.file.basename.replace(/\.md$/i, "") || "Meeting";
		if (title === "null") continue;
		const chips: string[] = [];
		if (m.date?.trim()) chips.push(m.date.slice(0, 10));
		if (m.totalMinutesTracked && m.totalMinutesTracked > 0)
			chips.push(formatTrackedMinutesShort(m.totalMinutesTracked));
		actItems.push({
			sortMs: sortMsForMeeting(m),
			title,
			stampLabel: "",
			hoverPath: m.file.path,
			chips,
		});
	}
	for (const e of logEntries) {
		const title = e.title?.trim() || "Log entry";
		if (title === "null") continue;
		actItems.push({
			sortMs: e.sortMs,
			title,
			stampLabel: e.stampLabel,
			chips: [],
		});
	}
	actItems.sort((a, b) => b.sortMs - a.sortMs);

	if (actItems.length > 0) {
		lines.push("### Activity");
		const limit = 50;
		for (const row of actItems.slice(0, limit)) {
			const meta = row.chips.length ? ` (${row.chips.join(", ")})` : "";
			const prefix = row.stampLabel ? `${row.stampLabel} — ` : "";
			let bullet: string;
			if (row.hoverPath && row.hoverPath !== projectPath) {
				const f = app.vault.getAbstractFileByPath(row.hoverPath);
				const linkText =
					f instanceof TFile
						? (app.metadataCache.fileToLinktext(f, projectPath, true) ?? row.hoverPath)
						: row.hoverPath;
				const display = stripWikilinkForDisplay(row.title);
				bullet = `- ${prefix}[[${linkText}|${display}]]${meta}`;
			} else {
				bullet = `- ${prefix}${row.title}${meta}`;
			}
			lines.push(bullet);
		}
		if (actItems.length > limit) {
			lines.push(`- *… and ${actItems.length - limit} more*`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function escapeTablePipe(s: string): string {
	return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Strip wikilink markup so the result is safe as display text inside [[path|display]]. */
function stripWikilinkForDisplay(s: string): string {
	// Extract display from [[path|display]] or [[path]]
	const m = s.match(/^\[\[(?:[^\]]*\|)?([^\]]*)\]\]$/);
	const extracted = m?.[1];
	if (extracted != null) return extracted.trim() || s;
	// Strip any [[...]] segments, keeping the display part; replace | with · to avoid breaking [[path|display]]
	return s
		.replace(/\[\[([^\]]*)\]\]/g, (_, inner) => {
			const pipeIdx = inner.indexOf("|");
			return pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : inner.trim();
		})
		.replace(/\|/g, " · ")
		.trim() || s;
}

/** Build the full snapshot block: header + body + visible footer + end marker. */
export function buildFullSnapshotBlock(body: string): string {
	const date = todayLocalISODate();
	const header = `${SNAPSHOT_HEADER_PREFIX}${date})`;
	const visibleFooter = "*Snapshot captured by Fulcrum*";
	return `${header}\n\n${body.trimEnd()}\n\n${visibleFooter}\n${SNAPSHOT_FOOTER}`;
}

/**
 * Insert or replace the project snapshot in the project file.
 * Replaces everything from the snapshot header through the footer.
 * If no existing snapshot, appends at the end.
 */
export async function insertOrReplaceProjectSnapshot(
	app: App,
	projectFile: TFile,
	fullBlock: string,
): Promise<void> {
	const body = await app.vault.read(projectFile);
	const headerIdx = body.indexOf(SNAPSHOT_HEADER_PREFIX);
	const footerIdx = body.indexOf(SNAPSHOT_FOOTER);

	let newBody: string;
	if (headerIdx !== -1 && footerIdx !== -1 && footerIdx > headerIdx) {
		// Replace existing snapshot: from start of header line to end of footer line
		const lineStart = body.lastIndexOf("\n", headerIdx) + 1;
		const afterFooter = body.indexOf("\n", footerIdx);
		const lineEnd = afterFooter === -1 ? body.length : afterFooter + 1;
		const before = body.slice(0, lineStart).trimEnd();
		const after = body.slice(lineEnd).trimStart();
		newBody = [before, fullBlock, after].filter(Boolean).join("\n\n");
	} else {
		// Append new snapshot
		const trimmed = body.replace(/\s*$/, "");
		newBody = trimmed ? `${trimmed}\n\n${fullBlock}` : fullBlock;
	}

	await app.vault.modify(projectFile, newBody);
}
