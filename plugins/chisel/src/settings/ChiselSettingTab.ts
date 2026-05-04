import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type ChiselPlugin from "../main";
import type { OpenViewsIn } from "@obsidian-suite/core";

export class ChiselSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ChiselPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Chisel" });
		containerEl.createEl("p", {
			text: "Credit card payoff projections use daily compounding (APR ÷ 365) and fixed monthly payments on each anniversary of the start date.",
			cls: "setting-item-description",
		});

		new Setting(containerEl).setName("Currency").setDesc("ISO 4217 code for formatting amounts.").addText((t) =>
			t.setValue(this.plugin.settings.currency).onChange(async (v) => {
				this.plugin.settings.currency = v.trim().toUpperCase() || "USD";
				await this.plugin.persist();
				this.plugin.refreshChiselViews();
			}),
		);

		new Setting(containerEl)
			.setName("Open Chisel in")
			.setDesc("Default area when using the ribbon or command.")
			.addDropdown((dd) =>
				dd
					.addOption("sidebar", "Right sidebar")
					.addOption("main", "Editor tab")
					.setValue(this.plugin.settings.openViewsIn)
					.onChange(async (v) => {
						this.plugin.settings.openViewsIn = v as OpenViewsIn;
						await this.plugin.persist();
						this.plugin.refreshChiselViews();
					}),
			);
	}
}
