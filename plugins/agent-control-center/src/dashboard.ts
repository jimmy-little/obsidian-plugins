import { MarkdownRenderChild, Notice, setIcon } from "obsidian";
import { missingEnvKeys, missingKeyText, readEnvStatus } from "./envStatus";
import { HYO_RUN_EVENT, hyoIsLoaded, hyoRunDetail } from "./hyo";
import { buildCorePacket } from "./packet";
import { RunSkillModal, notifyLaunchError } from "./runModal";
import { SkillDocModal } from "./skillDocModal";
import { groupSkills, loadSkill, loadSkillsIndex } from "./skills";
import type AgentControlCenterPlugin from "./main";
import type { SkillInputValues, SkillMeta } from "./types";

export class DashboardBlock extends MarkdownRenderChild {
	private query = "";
	private body: HTMLElement | null = null;

	constructor(
		containerEl: HTMLElement,
		private plugin: AgentControlCenterPlugin,
	) {
		super(containerEl);
	}

	onload(): void {
		const wrap = this.containerEl.createDiv({ cls: "acc-dashboard" });
		const bar = wrap.createDiv({ cls: "acc-actions" });
		const filter = bar.createEl("input", {
			attr: { type: "search", placeholder: "Filter skills" },
			cls: "acc-filter",
		});
		filter.addEventListener("input", () => {
			this.query = filter.value;
			this.render();
		});
		const refresh = bar.createEl("button", { text: "Refresh" });
		refresh.addEventListener("click", () => this.render());
		this.body = wrap.createDiv({ cls: "acc-body" });
		this.render();
	}

	private render(): void {
		const body = this.body;
		if (!body) return;
		body.empty();

		let index;
		let env;
		try {
			env = readEnvStatus(this.plugin.envPath());
			index = loadSkillsIndex(this.plugin.repoPath());
		} catch (error) {
			body.createEl("p", {
				text: error instanceof Error ? error.message : String(error),
				cls: "acc-missing",
			});
			return;
		}

		if (index.error) {
			body.createEl("p", { text: index.error, cls: "acc-missing" });
			return;
		}

		if (!env.exists) {
			body.createEl("p", { text: "Secrets file is missing.", cls: "acc-missing" });
		}

		const groups = groupSkills(index.skills, this.query);
		const shown = groups.reduce((sum, group) => sum + group.skills.length, 0);
		body.createEl("p", { text: `${shown} skills from the git folder.` });

		if (!groups.length) {
			body.createEl("p", { text: "No skills match that filter." });
			return;
		}

		for (const group of groups) {
			const section = body.createDiv({ cls: "acc-domain" });
			section.createEl("h3", { text: group.domain });
			const grid = section.createDiv({ cls: "acc-grid" });
			for (const skill of group.skills) {
				this.renderTile(grid, skill, env.status);
			}
		}
	}

	private renderTile(grid: HTMLElement, skill: SkillMeta, envStatus: Map<string, boolean>): void {
		const tile = grid.createDiv({ cls: "acc-tile" });
		tile.createEl("h4", { text: skill.label });
		tile.createEl("p", { text: skill.description, cls: "acc-desc" });
		const missing = missingEnvKeys(skill.requires_env, envStatus);
		if (missing.length) {
			tile.createEl("p", { text: missingKeyText(missing), cls: "acc-missing" });
		}
		const actions = tile.createDiv({ cls: "acc-tile-actions" });
		const info = actions.createEl("button", {
			cls: "acc-info",
			attr: { "aria-label": "Instructions", title: "Instructions" },
		});
		setIcon(info, "info");
		info.addEventListener("click", () => {
			new SkillDocModal(this.plugin.app, this.plugin.repoPath(), skill).open();
		});
		const run = actions.createEl("button", { text: "Run", cls: "acc-run" });
		run.disabled = missing.length > 0;
		run.addEventListener("click", () => this.run(skill));
	}

	private run(skill: SkillMeta): void {
		if ((skill.inputs ?? []).length > 0) {
			new RunSkillModal(this.plugin.app, skill, (values) => this.launch(skill, values)).open();
			return;
		}
		this.launch(skill, {});
	}

	private launch(skill: SkillMeta, inputs: SkillInputValues): void {
		const plugins = (
			this.plugin.app as { plugins?: { plugins?: Record<string, unknown> } }
		).plugins?.plugins;
		if (!hyoIsLoaded(plugins)) {
			new Notice("Hyo is not enabled. Enable Hyo Claude Code Agent, then run again.");
			return;
		}
		try {
			const loaded = loadSkill(this.plugin.repoPath(), skill);
			const prompt = buildCorePacket(loaded, inputs);
			window.dispatchEvent(new CustomEvent(HYO_RUN_EVENT, { detail: hyoRunDetail(prompt) }));
			new Notice(`Sent ${skill.label} to Hyo.`);
		} catch (error) {
			notifyLaunchError(error);
		}
	}
}
