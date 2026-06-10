import type {App} from "obsidian";
import {TFile} from "obsidian";
import {appendLineUnderSectionHeading} from "../projectNote";

export type ProjectMilestone = {
	dateIso: string;
	title: string;
};

/** `YYYY-MM-DD: Title` — optional list marker prefix. */
const MILESTONE_LINE =
	/^\s*(?:[-*+]\s+|\d+\.\s+)?(\d{4}-\d{2}-\d{2})\s*:\s*(.+?)\s*$/;

function normalizeSectionHeading(heading: string): string {
	return heading.replace(/^#+\s*/, "").trim().toLowerCase();
}

/** Body text under the first matching `##` section (excludes the heading line). */
export function extractH2SectionBody(body: string, configuredHeading: string): string | null {
	const want = normalizeSectionHeading(configuredHeading);
	const h2Re = /^##[ \t]+(.+)$/gm;
	let m: RegExpExecArray | null;
	while ((m = h2Re.exec(body)) !== null) {
		if (normalizeSectionHeading(m[1]!) !== want) continue;
		const start = m.index + m[0].length;
		const rest = body.slice(start);
		const next = rest.search(/\n##[ \t]/);
		return (next === -1 ? rest : rest.slice(0, next)).trim();
	}
	return null;
}

/** Parse milestone lines from a project note body. */
export function parseProjectMilestones(
	body: string,
	sectionHeading: string,
): ProjectMilestone[] {
	const section = extractH2SectionBody(body, sectionHeading);
	if (!section) return [];
	const out: ProjectMilestone[] = [];
	for (const line of section.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const m = trimmed.match(MILESTONE_LINE);
		if (!m?.[1] || !m[2]) continue;
		const title = m[2].trim();
		if (!title) continue;
		if (Number.isNaN(Date.parse(`${m[1]}T12:00:00`))) continue;
		out.push({dateIso: m[1], title});
	}
	out.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.title.localeCompare(b.title));
	return out;
}

export async function readProjectMilestones(
	app: App,
	projectFile: TFile,
	sectionHeading: string,
): Promise<ProjectMilestone[]> {
	const body = await app.vault.cachedRead(projectFile);
	return parseProjectMilestones(body, sectionHeading);
}

export async function loadProjectMilestonesMap(
	app: App,
	projectPaths: string[],
	sectionHeading: string,
): Promise<Map<string, ProjectMilestone[]>> {
	const map = new Map<string, ProjectMilestone[]>();
	if (!sectionHeading.trim() || projectPaths.length === 0) return map;
	await Promise.all(
		projectPaths.map(async (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return;
			const milestones = await readProjectMilestones(app, file, sectionHeading);
			if (milestones.length > 0) map.set(path, milestones);
		}),
	);
	return map;
}

export function formatProjectMilestoneLine(dateIso: string, title: string): string {
	return `${dateIso}: ${title.trim()}`;
}

export async function appendProjectMilestone(
	app: App,
	projectFile: TFile,
	sectionHeading: string,
	dateIso: string,
	title: string,
): Promise<void> {
	const heading = sectionHeading.trim();
	if (!heading) throw new Error("Missing milestones section heading");
	const label = title.trim();
	if (!label) throw new Error("Enter a milestone title.");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) throw new Error("Pick a valid date.");
	if (Number.isNaN(Date.parse(`${dateIso}T12:00:00`))) throw new Error("Pick a valid date.");
	const line = formatProjectMilestoneLine(dateIso, label);
	const body = await app.vault.read(projectFile);
	await app.vault.modify(projectFile, appendLineUnderSectionHeading(body, heading, line));
}
