import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { LoadedSkill, SkillMeta, SkillsIndex } from "./types";

export const DOMAIN_ORDER = ["work", "personal", "productivity", "engineering", "misc"];

export function loadSkillsIndex(repoPath: string): SkillsIndex {
	const indexPath = join(repoPath, "index.json");
	if (!existsSync(indexPath)) {
		return {
			error: `No index at ${indexPath}. Run node scripts/build-index.mjs in the skills repo.`,
			generatedAt: null,
			count: 0,
			skills: [],
		};
	}
	const idx = JSON.parse(readFileSync(indexPath, "utf8")) as {
		generatedAt?: string;
		count?: number;
		skills?: SkillMeta[];
	};
	const skills = (idx.skills ?? []).map((skill) => ({
		slug: skill.slug,
		name: skill.name || skill.slug,
		label: skill.label || skill.slug,
		description: skill.description || "",
		domain: skill.domain,
		status: skill.status,
		requires_env: Array.isArray(skill.requires_env) ? skill.requires_env : [],
		inputs: Array.isArray(skill.inputs) ? skill.inputs : [],
		path: skill.path,
	}));
	return {
		generatedAt: idx.generatedAt ?? null,
		count: idx.count ?? skills.length,
		skills,
	};
}

export function loadSkill(repoPath: string, skill: SkillMeta): LoadedSkill {
	const skillMdPath = join(repoPath, skill.path);
	if (!existsSync(skillMdPath)) {
		throw new Error(`Skill file not found: ${skillMdPath}`);
	}
	const raw = readFileSync(skillMdPath, "utf8");
	return { ...skill, skillMdPath, body: stripSkillFrontmatter(raw) };
}

export function stripSkillFrontmatter(raw: string): string {
	const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
	return (match ? match[1] : raw).trim();
}

export function groupSkills(
	skills: SkillMeta[],
	query: string,
): { domain: string; skills: SkillMeta[] }[] {
	const needle = query.trim().toLowerCase();
	const matched = needle
		? skills.filter((skill) =>
				[skill.label, skill.description, skill.slug].join("\n").toLowerCase().includes(needle),
			)
		: skills;
	const buckets = new Map<string, SkillMeta[]>();
	for (const skill of matched) {
		const domain = skill.domain || "misc";
		const list = buckets.get(domain) ?? [];
		list.push(skill);
		buckets.set(domain, list);
	}
	for (const list of buckets.values()) {
		list.sort((a, b) => a.label.localeCompare(b.label));
	}
	const ordered = [
		...DOMAIN_ORDER.filter((domain) => buckets.has(domain)),
		...[...buckets.keys()].filter((domain) => !DOMAIN_ORDER.includes(domain)).sort(),
	];
	return ordered.map((domain) => ({ domain, skills: buckets.get(domain) ?? [] }));
}
