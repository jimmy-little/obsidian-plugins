import { App, Modal, Notice, PluginSettingTab, Setting, TFile } from "obsidian";
import type { KeyMapping, WorkoutTemplate, AdditionalFrontMatter } from "./import/types";
import type PulsePlugin from "./main";

export interface WorkoutSettings {
	exercisesFolder: string;
	sessionsFolder: string;
	programsFolder: string;
	weightUnit: "lb" | "kg";
	defaultRestSeconds: number;
	showRibbonIcon: boolean;
	autoPR: boolean;
}

export interface PulseSettings extends WorkoutSettings {
	keyMappings: KeyMapping[];
	templates: WorkoutTemplate[];
	defaultTemplatePath: string;
	saveDestination: string;
	additionalFrontMatter: AdditionalFrontMatter[];
	scanFolderPath: string;
	deleteSourceAfterImport: boolean;
	statsNotePathTemplate: string;
	statsNoteBodyTemplatePath: string;
	mapTileStyle: "osm" | "carto-dark" | "maptiler-fiord";
	maptilerApiKey: string;
}

export const DEFAULT_SETTINGS: PulseSettings = {
	// Workout tracking
	exercisesFolder: "Workouts/Exercises",
	sessionsFolder: "Workouts/Sessions",
	programsFolder: "Workouts/Programs",
	weightUnit: "lb",
	defaultRestSeconds: 90,
	showRibbonIcon: true,
	autoPR: true,
	// Import
	keyMappings: [
		{ jsonKey: "name", yamlKey: "name" },
		{ jsonKey: "duration", yamlKey: "duration", rounding: 0 },
		{ jsonKey: "activeEnergyBurned.qty", yamlKey: "calories", rounding: 0 },
		{ jsonKey: "intensity.qty", yamlKey: "intensity", rounding: 1 },
		{ jsonKey: "start", yamlKey: "start" },
		{ jsonKey: "end", yamlKey: "end" },
	],
	templates: [],
	defaultTemplatePath: "",
	saveDestination: "{YYYY}/{MM}/{YYYYMMDD-HHMM}-{name}.md",
	additionalFrontMatter: [],
	scanFolderPath: "",
	deleteSourceAfterImport: true,
	statsNotePathTemplate: "60 Logs/{year}/Stats/{month}/{date}.md",
	statsNoteBodyTemplatePath: "",
	mapTileStyle: "maptiler-fiord",
	maptilerApiKey: "",
};

export class PulseSettingTab extends PluginSettingTab {
	plugin: PulsePlugin;

	constructor(app: App, plugin: PulsePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Pulse Settings" });

		// --- Workout Tracking ---
		containerEl.createEl("h3", { text: "Workout Tracking" });

		new Setting(containerEl)
			.setName("Exercises folder")
			.setDesc("Vault folder for exercise notes")
			.addText(text => text
				.setPlaceholder("Workouts/Exercises")
				.setValue(this.plugin.settings.exercisesFolder)
				.onChange(async v => { this.plugin.settings.exercisesFolder = v || "Workouts/Exercises"; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Sessions folder")
			.setDesc("Vault folder for session notes")
			.addText(text => text
				.setPlaceholder("Workouts/Sessions")
				.setValue(this.plugin.settings.sessionsFolder)
				.onChange(async v => { this.plugin.settings.sessionsFolder = v || "Workouts/Sessions"; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Programs folder")
			.setDesc("Vault folder for program notes")
			.addText(text => text
				.setPlaceholder("Workouts/Programs")
				.setValue(this.plugin.settings.programsFolder)
				.onChange(async v => { this.plugin.settings.programsFolder = v || "Workouts/Programs"; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Weight unit")
			.setDesc("Default unit for new exercises")
			.addDropdown(drop => drop
				.addOption("lb", "Pounds (lb)")
				.addOption("kg", "Kilograms (kg)")
				.setValue(this.plugin.settings.weightUnit)
				.onChange(async v => { this.plugin.settings.weightUnit = v as "lb" | "kg"; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Default rest timer")
			.setDesc("Seconds between sets")
			.addText(text => text
				.setPlaceholder("90")
				.setValue(String(this.plugin.settings.defaultRestSeconds))
				.onChange(async v => { this.plugin.settings.defaultRestSeconds = parseInt(v) || 90; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Show ribbon icon")
			.setDesc("Show the Pulse dumbbell icon in the left ribbon")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showRibbonIcon)
				.onChange(async v => { this.plugin.settings.showRibbonIcon = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Auto-update PRs")
			.setDesc("Automatically update personal record frontmatter when saving sessions")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoPR)
				.onChange(async v => { this.plugin.settings.autoPR = v; await this.plugin.saveSettings(); }));

		// --- Import Settings ---
		containerEl.createEl("h3", { text: "Health Data Import" });

		new Setting(containerEl)
			.setName("Folder to scan")
			.setDesc("Folder path to scan for JSON, body comp CSV, and Workouts CSV. Leave empty to scan the whole vault.")
			.addText(text => text
				.setPlaceholder("e.g. Health Imports")
				.setValue(this.plugin.settings.scanFolderPath ?? "")
				.onChange(async v => { this.plugin.settings.scanFolderPath = v ?? ""; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Move to trash after import")
			.setDesc("After successfully processing a file, move it to the vault .trash folder.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deleteSourceAfterImport ?? true)
				.onChange(async v => { this.plugin.settings.deleteSourceAfterImport = v; await this.plugin.saveSettings(); }));

		containerEl.createEl("h3", { text: "Route Maps" });

		new Setting(containerEl)
			.setName("Map style")
			.setDesc("Basemap style for workout route images")
			.addDropdown(drop => drop
				.addOption("maptiler-fiord", "Fiord (dark blue, MapTiler)")
				.addOption("carto-dark", "Carto Dark (dark, no key)")
				.addOption("osm", "OpenStreetMap (light)")
				.setValue(this.plugin.settings.mapTileStyle ?? "maptiler-fiord")
				.onChange(async v => { this.plugin.settings.mapTileStyle = v as "osm" | "carto-dark" | "maptiler-fiord"; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("MapTiler API key")
			.setDesc("Required for Fiord style. Get a free key at cloud.maptiler.com.")
			.addText(text => text
				.setPlaceholder("optional")
				.setValue(this.plugin.settings.maptilerApiKey ?? "")
				.onChange(async v => { this.plugin.settings.maptilerApiKey = v ?? ""; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Stats note path")
			.setDesc("Where to create/update daily stats. Variables: {year}, {month}, {date}")
			.addText(text => text
				.setPlaceholder("60 Logs/{year}/Stats/{month}/{date}.md")
				.setValue(this.plugin.settings.statsNotePathTemplate ?? "60 Logs/{year}/Stats/{month}/{date}.md")
				.onChange(async v => { this.plugin.settings.statsNotePathTemplate = v?.trim() || "60 Logs/{year}/Stats/{month}/{date}.md"; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName("Stats note body template")
			.setDesc("Optional note whose contents are added below frontmatter for new stats notes.")
			.addText(text => text
				.setPlaceholder("e.g. Templates/Stats body.md")
				.setValue(this.plugin.settings.statsNoteBodyTemplatePath ?? "")
				.onChange(async v => { this.plugin.settings.statsNoteBodyTemplatePath = v ?? ""; await this.plugin.saveSettings(); }))
			.addButton(button => button.setButtonText("Browse").onClick(() => {
				const files = this.app.vault.getMarkdownFiles();
				new FilePickerModal(this.app, files, async (f) => {
					if (f) { this.plugin.settings.statsNoteBodyTemplatePath = f.path; await this.plugin.saveSettings(); this.display(); }
				}).open();
			}));

		// Save Destination
		containerEl.createEl("h3", { text: "Save Destination" });

		new Setting(containerEl)
			.setName("Save destination template")
			.setDesc("Template path: {YYYY}, {MM}, {YYYYMMDD-HHMM}, {YYYY-MM-DD-HHMM}, {name}")
			.addText(text => text
				.setPlaceholder("{YYYY}/{MM}/{YYYYMMDD-HHMM}-{name}.md")
				.setValue(this.plugin.settings.saveDestination)
				.onChange(async v => { this.plugin.settings.saveDestination = v; await this.plugin.saveSettings(); }));

		// Banners
		containerEl.createEl("h3", { text: "Workout Banners" });

		new Setting(containerEl)
			.setName("Update all banners")
			.setDesc("Regenerate banner images for all workout notes in the vault.")
			.addButton(btn => btn.setButtonText("Update all banners").onClick(async () => {
				btn.setDisabled(true);
				try {
					const result = await this.plugin.importManager.updateAllBanners();
					new Notice(`Banners: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} error(s)`);
				} finally { btn.setDisabled(false); }
			}));

		// Default Template
		containerEl.createEl("h3", { text: "Default Template" });

		new Setting(containerEl)
			.setName("Default template path")
			.setDesc("Template file to use when no workout type matches")
			.addText(text => text
				.setPlaceholder("path/to/template.md")
				.setValue(this.plugin.settings.defaultTemplatePath)
				.onChange(async v => { this.plugin.settings.defaultTemplatePath = v; await this.plugin.saveSettings(); }))
			.addButton(button => button.setButtonText("Browse").onClick(() => {
				const files = this.app.vault.getMarkdownFiles();
				new FilePickerModal(this.app, files, (f) => {
					if (f) { this.plugin.settings.defaultTemplatePath = f.path; this.plugin.saveSettings(); this.display(); }
				}).open();
			}));

		// Key Mappings
		containerEl.createEl("h3", { text: "Workout Pages: JSON to YAML Key Mappings" });
		const mappingsContainer = containerEl.createDiv("key-mappings-container");
		this.renderKeyMappings(mappingsContainer);
		const addMappingBtn = containerEl.createEl("button", { text: "+ Add Mapping", cls: "mod-cta" });
		addMappingBtn.addEventListener("click", () => {
			this.plugin.settings.keyMappings.push({ jsonKey: "", yamlKey: "", rounding: undefined });
			this.plugin.saveSettings();
			this.display();
		});

		// Additional Front Matter
		containerEl.createEl("h3", { text: "Workout Pages: Additional Front Matter" });
		const fmContainer = containerEl.createDiv("additional-frontmatter-container");
		this.renderAdditionalFrontMatter(fmContainer);
		const addFmBtn = containerEl.createEl("button", { text: "+ Add Field", cls: "mod-cta" });
		addFmBtn.addEventListener("click", () => {
			this.plugin.settings.additionalFrontMatter.push({ key: "", value: "" });
			this.plugin.saveSettings();
			this.display();
		});

		// Templates
		containerEl.createEl("h3", { text: "Workout Type Templates" });
		const templatesContainer = containerEl.createDiv("templates-container");
		this.renderTemplates(templatesContainer);
		const addTemplateBtn = containerEl.createEl("button", { text: "+ Add Template", cls: "mod-cta" });
		addTemplateBtn.addEventListener("click", () => {
			this.plugin.settings.templates.push({ workoutType: "", templatePath: "" });
			this.plugin.saveSettings();
			this.display();
		});

		containerEl.createEl("h3", { text: "URL schemes (Obsidian URI)" });
		containerEl.createEl("p", {
			text: "URI host must be pulse (plugin id). Use query params only — e.g. obsidian://pulse?screen=today. Do not use action=open; that targets the core “open” handler. Aliases: programs → program. Optional path= when needed.",
		});
		const pulseUris: [string, string][] = [
			["/pulse/today (default)", "obsidian://pulse?screen=today"],
			["/pulse/program — alias screen=programs", "obsidian://pulse?screen=programs"],
			["/pulse/stats", "obsidian://pulse?screen=stats"],
			["/pulse/history", "obsidian://pulse?screen=history"],
			["/pulse/exercise", "obsidian://pulse?screen=exercise"],
			["/pulse/session", "obsidian://pulse?screen=session"],
			["route=/pulse/today", "obsidian://pulse?route=%2Fpulse%2Ftoday"],
		];
		for (const [label, uri] of pulseUris) {
			containerEl.createEl("p", { text: label, cls: "setting-item-description" });
			const pre = containerEl.createEl("pre", { text: uri });
			pre.style.whiteSpace = "pre-wrap";
			pre.style.wordBreak = "break-all";
		}
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Other screens (same pattern): new-exercise, workout-builder, program-builder, edit-program, workout-edit — use screen=… and path= when required.",
		});
	}

	private renderKeyMappings(container: HTMLElement): void {
		container.empty();
		if (this.plugin.settings.keyMappings.length === 0) {
			container.createEl("p", { text: "No mappings. Click '+ Add Mapping' to add one.", cls: "setting-item-description" });
			return;
		}
		this.plugin.settings.keyMappings.forEach((mapping, index) => {
			const row = container.createDiv({ cls: "pulse-settings-row" });
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "10px";
			row.style.marginBottom = "10px";
			const jsonInput = row.createEl("input", { type: "text", cls: "setting-input", value: mapping.jsonKey, placeholder: "JSON key" });
			jsonInput.style.flex = "1";
			jsonInput.addEventListener("input", async (e) => { this.plugin.settings.keyMappings[index].jsonKey = (e.target as HTMLInputElement).value; await this.plugin.saveSettings(); });
			const yamlInput = row.createEl("input", { type: "text", cls: "setting-input", value: mapping.yamlKey, placeholder: "YAML key" });
			yamlInput.style.flex = "1";
			yamlInput.addEventListener("input", async (e) => { this.plugin.settings.keyMappings[index].yamlKey = (e.target as HTMLInputElement).value; await this.plugin.saveSettings(); });
			const roundingInput = row.createEl("input", { type: "number", cls: "setting-input", value: mapping.rounding !== undefined ? mapping.rounding.toString() : "", placeholder: "Round", attr: { min: "0", step: "1" } });
			roundingInput.style.width = "80px";
			roundingInput.addEventListener("input", async (e) => { const v = (e.target as HTMLInputElement).value; const n = v === "" ? undefined : parseInt(v, 10); if (n !== undefined && (isNaN(n) || n < 0)) return; this.plugin.settings.keyMappings[index].rounding = n; await this.plugin.saveSettings(); });
			const removeBtn = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Remove" } });
			removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
			removeBtn.addEventListener("click", async () => { this.plugin.settings.keyMappings.splice(index, 1); await this.plugin.saveSettings(); this.display(); });
		});
	}

	private renderAdditionalFrontMatter(container: HTMLElement): void {
		container.empty();
		if (this.plugin.settings.additionalFrontMatter.length === 0) {
			container.createEl("p", { text: "No additional fields.", cls: "setting-item-description" });
			return;
		}
		this.plugin.settings.additionalFrontMatter.forEach((field, index) => {
			const row = container.createDiv({ cls: "pulse-settings-row" });
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "10px";
			row.style.marginBottom = "10px";
			const keyInput = row.createEl("input", { type: "text", cls: "setting-input", value: field.key, placeholder: "Key" });
			keyInput.style.flex = "1";
			keyInput.style.maxWidth = "200px";
			keyInput.addEventListener("input", async (e) => { this.plugin.settings.additionalFrontMatter[index].key = (e.target as HTMLInputElement).value; await this.plugin.saveSettings(); });
			const valueInput = row.createEl("input", { type: "text", cls: "setting-input", value: field.value, placeholder: "Value ({image}, {template}, {name})" });
			valueInput.style.flex = "1";
			valueInput.addEventListener("input", async (e) => { this.plugin.settings.additionalFrontMatter[index].value = (e.target as HTMLInputElement).value; await this.plugin.saveSettings(); });
			const removeBtn = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Remove" } });
			removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
			removeBtn.addEventListener("click", async () => { this.plugin.settings.additionalFrontMatter.splice(index, 1); await this.plugin.saveSettings(); this.display(); });
		});
	}

	private renderTemplates(container: HTMLElement): void {
		container.empty();
		if (this.plugin.settings.templates.length === 0) {
			container.createEl("p", { text: "No templates.", cls: "setting-item-description" });
			return;
		}
		this.plugin.settings.templates.forEach((template, index) => {
			const row = container.createDiv({ cls: "pulse-settings-row" });
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "10px";
			row.style.marginBottom = "10px";
			const typeInput = row.createEl("input", { type: "text", cls: "setting-input", value: template.workoutType, placeholder: "Workout type" });
			typeInput.style.flex = "1";
			typeInput.style.maxWidth = "200px";
			typeInput.addEventListener("input", async (e) => { this.plugin.settings.templates[index].workoutType = (e.target as HTMLInputElement).value; await this.plugin.saveSettings(); });
			const pathInput = row.createEl("input", { type: "text", cls: "setting-input", value: template.templatePath, placeholder: "Click to select template" });
			pathInput.style.flex = "1";
			pathInput.style.cursor = "pointer";
			pathInput.readOnly = true;
			pathInput.addEventListener("click", () => {
				const files = this.app.vault.getMarkdownFiles();
				new FilePickerModal(this.app, files, (f) => { if (f) { this.plugin.settings.templates[index].templatePath = f.path; this.plugin.saveSettings(); this.display(); } }).open();
			});
			const removeBtn = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Remove" } });
			removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
			removeBtn.addEventListener("click", async () => { this.plugin.settings.templates.splice(index, 1); await this.plugin.saveSettings(); this.display(); });
		});
	}
}

class FilePickerModal extends Modal {
	files: TFile[];
	onSelect: (file: TFile) => void;

	constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Select File" });
		const fileList = contentEl.createDiv("file-picker-list");
		fileList.style.maxHeight = "400px";
		fileList.style.overflowY = "auto";
		this.files.forEach((file) => {
			const item = fileList.createDiv("file-picker-item");
			item.style.padding = "8px";
			item.style.cursor = "pointer";
			item.style.borderBottom = "1px solid var(--background-modifier-border)";
			item.createEl("div", { text: file.path });
			item.addEventListener("click", () => { this.onSelect(file); this.close(); });
			item.addEventListener("mouseenter", () => { item.style.backgroundColor = "var(--background-modifier-hover)"; });
			item.addEventListener("mouseleave", () => { item.style.backgroundColor = "transparent"; });
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
