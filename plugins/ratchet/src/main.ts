import { Notice, Plugin, type ObsidianProtocolData } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { createSuiteShellViewClass } from "@obsidian-suite/svelte-shell";
import App from "./App.svelte";
import { RatchetSettingTab } from "./RatchetSettingTab";

/** Match legacy obsidian-ratchet `VIEW_TYPE_RATCHET_MAIN` */
export const VIEW_TYPE = "ratchet-main-view";

const ShellView = createSuiteShellViewClass({
	viewType: VIEW_TYPE,
	displayText: "Ratchet",
	icon: "tally-5",
	App,
});

export default class RatchetPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new ShellView(leaf, this));

		this.addRibbonIcon("tally-5", "Ratchet", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open Ratchet",
			callback: () => void this.activateMainView(),
		});

		this.addSettingTab(new RatchetSettingTab(this.app, this));

		this.registerObsidianProtocolHandler(this.manifest.id, (params) => {
			void this.applyRatchetDeepLink(params).catch((err) => {
				console.error(err);
				new Notice("Ratchet could not open that link.");
			});
		});
	}

	private async applyRatchetDeepLink(params: ObsidianProtocolData): Promise<void> {
		const screen = String(params.screen ?? params.leaf ?? "").trim().toLowerCase();
		const route = String(params.route ?? "")
			.trim()
			.replace(/^\/+/, "");
		if (route) {
			const tail = route.replace(/^ratchet\//i, "");
			const seg = (tail.split("/")[0] ?? "").toLowerCase();
			if (seg && seg !== "main") {
				new Notice(`Ratchet: unknown route "${route}".`);
				return;
			}
		}
		if (screen && screen !== "main") {
			new Notice(`Ratchet: unknown screen "${screen}".`);
			return;
		}
		await this.activateMainView();
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE, "sidebar");
	}
}
