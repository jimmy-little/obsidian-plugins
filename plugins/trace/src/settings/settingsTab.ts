import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type TracePlugin from "../main";
import type { StatusCategory } from "../types";
import { DEFAULT_TOKEN_COLORS_DARK, DEFAULT_TOKEN_COLORS_LIGHT } from "./defaults";
import { applyTokenColorCss } from "./defaults";

const STATUS_CATEGORY_OPTIONS: StatusCategory[] = [
	"success",
	"error",
	"warning",
	"info",
	"neutral",
];

export class TraceSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: TracePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Trace" });

		containerEl.createEl("p", {
			text: "Highlight and filter log files (.log, .csv) and markdown notes with trace: true in frontmatter.",
			cls: "setting-item-description",
		});

		this.addColumnAliasSettings();
		this.addDelimiterSetting();
		this.addCustomStatusMappings();
		this.addColorSettings();
		this.addQueryLimitSetting();
	}

	private addColumnAliasSettings(): void {
		const fields = [
			{ key: "timestamp" as const, label: "Default column: timestamp" },
			{ key: "status" as const, label: "Default column: status" },
			{ key: "subject" as const, label: "Default column: subject" },
			{ key: "message" as const, label: "Default column: message" },
		];
		for (const { key, label } of fields) {
			new Setting(this.containerEl)
				.setName(label)
				.setDesc("Comma-separated header aliases")
				.addText((text) =>
					text
						.setValue(this.plugin.settings.columnAliases[key])
						.onChange(async (value) => {
							this.plugin.settings.columnAliases[key] = value;
							await this.plugin.saveSettings();
						}),
				);
		}
	}

	private addDelimiterSetting(): void {
		new Setting(this.containerEl)
			.setName("CSV delimiter")
			.addDropdown((d) =>
				d
					.addOption(",", "Comma (,)")
					.addOption("|", "Pipe (|)")
					.addOption("\\t", "Tab")
					.setValue(this.plugin.settings.csvDelimiter)
					.onChange(async (value) => {
						this.plugin.settings.csvDelimiter = value as "," | "|" | "\t";
						await this.plugin.saveSettings();
					}),
			);
	}

	private addCustomStatusMappings(): void {
		const wrap = this.containerEl.createDiv({ cls: "trace-custom-status-wrap" });
		new Setting(wrap)
			.setName("Custom status mappings")
			.setDesc("Add raw status value → category mappings");

		const renderRows = (): void => {
			wrap.querySelectorAll(".trace-custom-status-row").forEach((r) => r.remove());
			for (const [raw, category] of Object.entries(this.plugin.settings.customStatusMappings)) {
				const row = wrap.createDiv({ cls: "trace-custom-status-row" });
				new Setting(row)
					.addText((t) =>
						t.setValue(raw).onChange(async (v) => {
							const mappings = { ...this.plugin.settings.customStatusMappings };
							delete mappings[raw];
							if (v.trim()) mappings[v.trim().toUpperCase()] = category;
							this.plugin.settings.customStatusMappings = mappings;
							await this.plugin.saveSettings();
							renderRows();
						}),
					)
					.addDropdown((d) => {
						for (const c of STATUS_CATEGORY_OPTIONS) d.addOption(c, c);
						d.setValue(category).onChange(async (v) => {
							this.plugin.settings.customStatusMappings[raw] = v as StatusCategory;
							await this.plugin.saveSettings();
						});
					})
					.addButton((b) =>
						b.setButtonText("Remove").onClick(async () => {
							const mappings = { ...this.plugin.settings.customStatusMappings };
							delete mappings[raw];
							this.plugin.settings.customStatusMappings = mappings;
							await this.plugin.saveSettings();
							renderRows();
						}),
					);
			}
		};

		renderRows();

		new Setting(wrap).addButton((b) =>
			b.setButtonText("Add mapping").onClick(async () => {
				const mappings = { ...this.plugin.settings.customStatusMappings };
				mappings[`CUSTOM_${Object.keys(mappings).length + 1}`] = "neutral";
				this.plugin.settings.customStatusMappings = mappings;
				await this.plugin.saveSettings();
				renderRows();
			}),
		);
	}

	private addColorSettings(): void {
		this.containerEl.createEl("h3", { text: "Token colors" });
		const tokenKeys = Object.keys(DEFAULT_TOKEN_COLORS_DARK) as Array<
			keyof typeof DEFAULT_TOKEN_COLORS_DARK
		>;
		for (const key of tokenKeys) {
			new Setting(this.containerEl)
				.setName(key)
				.addText((text) =>
					text
						.setValue(this.plugin.settings.tokenColors[key])
						.onChange(async (value) => {
							this.plugin.settings.tokenColors[key] = value;
							applyTokenColorCss(this.plugin.settings);
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(this.containerEl)
			.setName("Reset colors to defaults")
			.addButton((b) =>
				b.setButtonText("Dark theme defaults").onClick(async () => {
					this.plugin.settings.tokenColors = { ...DEFAULT_TOKEN_COLORS_DARK };
					applyTokenColorCss(this.plugin.settings);
					await this.plugin.saveSettings();
					this.display();
				}),
			)
			.addButton((b) =>
				b.setButtonText("Light theme defaults").onClick(async () => {
					this.plugin.settings.tokenColors = { ...DEFAULT_TOKEN_COLORS_LIGHT };
					applyTokenColorCss(this.plugin.settings);
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}

	private addQueryLimitSetting(): void {
		new Setting(this.containerEl)
			.setName("Default query limit")
			.setDesc("Max rows in trace code blocks")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.defaultQueryLimit))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.defaultQueryLimit = n;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
