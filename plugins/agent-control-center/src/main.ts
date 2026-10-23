import { Notice, Plugin } from "obsidian";
import { existsSync } from "fs";
import { DashboardBlock } from "./dashboard";
import { renderEnvBlock } from "./envBlock";
import { expandHome } from "./paths";
import { DEFAULT_SETTINGS } from "./settings";
import { AgentControlCenterSettingTab } from "./settingsTab";
import type { AgentControlSettings } from "./types";

export default class AgentControlCenterPlugin extends Plugin {
	settings: AgentControlSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addSettingTab(new AgentControlCenterSettingTab(this.app, this));

		this.addCommand({
			id: "open-secrets-file",
			name: "Open secrets file",
			callback: () => void this.openEnv(),
		});
		this.addCommand({
			id: "reveal-secrets-file",
			name: "Reveal secrets file in Finder",
			callback: () => this.revealEnv(),
		});

		this.registerMarkdownCodeBlockProcessor("agent-env", (_source, el) => {
			renderEnvBlock(this, el);
		});
		this.registerMarkdownCodeBlockProcessor("agent-dashboard", (_source, el, ctx) => {
			ctx.addChild(new DashboardBlock(el, this));
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	envPath(): string {
		return expandHome(this.settings.envFilePath);
	}

	repoPath(): string {
		return expandHome(this.settings.skillsRepoPath);
	}

	async openEnv(): Promise<void> {
		const envPath = this.envPath();
		if (!existsSync(envPath)) {
			new Notice(`Secrets file not found: ${envPath}`);
			return;
		}
		const err = await this.shell().openPath(envPath);
		if (err) new Notice(err);
	}

	revealEnv(): void {
		const envPath = this.envPath();
		if (!existsSync(envPath)) {
			new Notice(`Secrets file not found: ${envPath}`);
			return;
		}
		this.shell().showItemInFolder(envPath);
	}

	private shell(): { openPath: (path: string) => Promise<string>; showItemInFolder: (path: string) => void } {
		return require("electron").shell;
	}
}
