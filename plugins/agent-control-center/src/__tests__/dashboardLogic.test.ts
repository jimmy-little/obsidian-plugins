import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { missingEnvKeys, missingKeyText, parseEnvSetMap } from "../envStatus";
import { buildCorePacket, buildDeepLink, defaultInputValues, missingRequiredInputs } from "../packet";
import { HYO_RUN_EVENT, hyoIsLoaded, hyoRunDetail } from "../hyo";
import { expandHome } from "../paths";
import { groupSkills, loadSkill, loadSkillsIndex, stripSkillFrontmatter } from "../skills";
import type { LoadedSkill } from "../types";

describe("env status", () => {
	it("marks empty and quoted values without returning them", () => {
		const map = parseEnvSetMap("# comment\nAPOLLO_KEY=\nJIRA_PAT=\"secret\"\n\nNOT_A_KEY\n");
		expect(map.get("APOLLO_KEY")).toBe(false);
		expect(map.get("JIRA_PAT")).toBe(true);
		expect([...map.values()].join(",")).not.toContain("secret");
	});

	it("names the empty keys", () => {
		const map = new Map<string, boolean>([["JIRA_URL", true], ["JIRA_PAT", false]]);
		expect(missingEnvKeys(["JIRA_URL", "JIRA_PAT", "JIRA_EMAIL"], map)).toEqual([
			"JIRA_PAT",
			"JIRA_EMAIL",
		]);
		expect(missingKeyText(["APOLLO_KEY"])).toBe("APOLLO_KEY is empty");
		expect(missingKeyText(["APOLLO_KEY", "APOLLO_GRAPH_REF"])).toBe(
			"APOLLO_KEY, APOLLO_GRAPH_REF are empty",
		);
	});
});

describe("skills index", () => {
	it("groups and filters skills from a checkout", () => {
		const root = mkdtempSync(join(tmpdir(), "acc-skills-"));
		mkdirSync(join(root, "skills", "demo"), { recursive: true });
		writeFileSync(
			join(root, "skills", "demo", "SKILL.md"),
			"---\nname: demo\n---\n\nDo the demo.\n",
		);
		writeFileSync(
			join(root, "index.json"),
			JSON.stringify({
				count: 2,
				skills: [
					{
						slug: "demo",
						label: "Demo Skill",
						description: "Writes a note",
						domain: "work",
						requires_env: ["JIRA_PAT"],
						inputs: [{ key: "day", label: "Plan for which day?", type: "select", options: ["today"], required: true }],
						path: "skills/demo/SKILL.md",
					},
					{
						slug: "other",
						label: "Other",
						description: "Personal thing",
						domain: "personal",
						path: "skills/missing/SKILL.md",
					},
				],
			}),
		);

		const index = loadSkillsIndex(root);
		expect(index.count).toBe(2);
		expect(groupSkills(index.skills, "note").map((group) => group.domain)).toEqual(["work"]);

		const loaded = loadSkill(root, index.skills[0]);
		expect(loaded.body).toBe("Do the demo.");
		expect(stripSkillFrontmatter("no frontmatter")).toBe("no frontmatter");
	});
});

describe("run packet", () => {
	const skill: LoadedSkill = {
		slug: "vault-action-plan",
		name: "vault-action-plan",
		label: "Vault Action Plan",
		description: "Plan the day",
		path: "skills/vault-action-plan/SKILL.md",
		skillMdPath: "/tmp/SKILL.md",
		body: "Make the plan.",
		inputs: [
			{
				key: "day",
				label: "Plan for which day?",
				type: "select",
				options: ["today", "tomorrow"],
				default: "today",
				required: true,
			},
		],
	};

	it("requires a blank required field and builds a short deeplink", () => {
		expect(missingRequiredInputs(skill, { day: "  " })).toEqual(["Plan for which day?"]);
		expect(defaultInputValues(skill).day).toBe("today");
		const packet = buildCorePacket(skill, { day: "tomorrow" });
		expect(packet).toContain("tomorrow");
		expect(packet).toContain("Make the plan.");
		expect(buildDeepLink(packet).withinLimit).toBe(true);
		expect(buildDeepLink("x".repeat(20000)).withinLimit).toBe(false);
	});
});

describe("hyo", () => {
	it("sends the skill packet as the Hyo prompt", () => {
		expect(hyoIsLoaded({ hyo: {} })).toBe(true);
		expect(hyoIsLoaded({})).toBe(false);
		expect(HYO_RUN_EVENT).toBe("hyo-run-command");
		expect(hyoRunDetail("Follow the skill.")).toEqual({ prompt: "Follow the skill." });
	});
});

describe("paths", () => {
	it("expands a home path", () => {
		expect(expandHome("~/Documents/GitHub/agent-skills")).toMatch(/\/Documents\/GitHub\/agent-skills$/);
		expect(expandHome("/tmp/skills")).toBe("/tmp/skills");
	});
});
