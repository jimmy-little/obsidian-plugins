import { missingEnvKeys, readEnvStatus } from "./envStatus";
import { loadSkillsIndex } from "./skills";
import type AgentControlCenterPlugin from "./main";

export function renderEnvBlock(plugin: AgentControlCenterPlugin, el: HTMLElement): void {
	el.empty();
	const wrap = el.createDiv({ cls: "acc-env" });
	const envPath = plugin.envPath();
	wrap.createEl("p", { text: envPath, cls: "acc-path" });

	const actions = wrap.createDiv({ cls: "acc-actions" });
	const openBtn = actions.createEl("button", { text: "Open secrets file" });
	openBtn.addEventListener("click", () => void plugin.openEnv());
	const revealBtn = actions.createEl("button", { text: "Reveal in Finder" });
	revealBtn.addEventListener("click", () => plugin.revealEnv());
	const refreshBtn = actions.createEl("button", { text: "Check again" });
	refreshBtn.addEventListener("click", () => renderEnvBlock(plugin, el));

	let env;
	let index;
	try {
		env = readEnvStatus(envPath);
		index = loadSkillsIndex(plugin.repoPath());
	} catch (error) {
		wrap.createEl("p", {
			text: error instanceof Error ? error.message : String(error),
			cls: "acc-missing",
		});
		return;
	}

	if (!env.exists) {
		wrap.createEl("p", { text: "Secrets file is missing.", cls: "acc-missing" });
		return;
	}

	if (index.error) {
		wrap.createEl("p", { text: index.error, cls: "acc-missing" });
		return;
	}

	const gaps = [];
	for (const skill of index.skills) {
		const missing = missingEnvKeys(skill.requires_env, env.status);
		if (missing.length) gaps.push({ skill, missing });
	}

	const setCount = [...env.status.values()].filter(Boolean).length;
	wrap.createEl("p", {
		text: `${setCount} keys set in the file. ${index.count} skills in the index.`,
	});

	if (!gaps.length) {
		wrap.createEl("p", {
			text: "Every key a skill asks for is set.",
			cls: "acc-ok",
		});
		return;
	}

	wrap.createEl("p", {
		text: `${gaps.length} skill${gaps.length === 1 ? "" : "s"} still ${gaps.length === 1 ? "has" : "have"} an empty key.`,
		cls: "acc-missing",
	});

	const table = wrap.createEl("table", { cls: "acc-table" });
	const head = table.createEl("tr");
	head.createEl("th", { text: "Skill" });
	head.createEl("th", { text: "Empty keys" });
	for (const gap of gaps) {
		const row = table.createEl("tr");
		row.createEl("td", { text: gap.skill.label });
		const cell = row.createEl("td");
		gap.missing.forEach((key, i) => {
			if (i) cell.appendText(", ");
			cell.createEl("code", { text: key });
		});
	}
}
