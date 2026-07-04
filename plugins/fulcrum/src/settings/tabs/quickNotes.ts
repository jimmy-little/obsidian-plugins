import {Setting} from "obsidian";
import type {QuickNoteTheme} from "../../fulcrum/settingsDefaults";
import {DEFAULT_QUICK_NOTE_THEMES} from "../../fulcrum/settingsDefaults";
import {bumpSettingsRevision} from "../../fulcrum/stores";
import type {SettingsContext} from "../settingsContext";
import {heading, settingsLead} from "../settingsHelpers";

function slugifyId(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48) || "theme";
}

function uniqueThemeId(themes: QuickNoteTheme[], base: string): string {
	let id = base;
	let n = 2;
	while (themes.some((t) => t.id === id)) {
		id = `${base}-${n}`;
		n++;
	}
	return id;
}

export function renderQuickNotesTab(ctx: SettingsContext): void {
	const {containerEl, plugin, refresh} = ctx;
	settingsLead(
		containerEl,
		"Themes appear in the quick note dropdown on project pages. Each theme adds inline fields (type, entry, journal) to the Fulcrum log entry.",
	);
	heading(containerEl, "Quick note themes");

	const listEl = containerEl.createDiv({cls: "fulcrum-quick-note-themes-list"});

	const renderThemes = (): void => {
		listEl.empty();
		const themes = plugin.settings.quickNoteThemes ?? [];

		for (let i = 0; i < themes.length; i++) {
			const theme = themes[i]!;
			const card = listEl.createDiv({cls: "fulcrum-quick-note-theme-card"});
			const titleEl = card.createEl("h4", {
				text: `${theme.emoji} ${theme.label}`.trim() || theme.id,
			});

			const updateCardTitle = (): void => {
				titleEl.setText(`${theme.emoji} ${theme.label}`.trim() || theme.id);
			};

			new Setting(card).setName("Emoji").addText((t) =>
				t.setValue(theme.emoji).onChange(async (v) => {
					theme.emoji = v;
					updateCardTitle();
					await plugin.saveSettings();
					bumpSettingsRevision();
				}),
			);

			new Setting(card).setName("Label").addText((t) =>
				t.setValue(theme.label).onChange(async (v) => {
					theme.label = v;
					updateCardTitle();
					await plugin.saveSettings();
					bumpSettingsRevision();
				}),
			);

			new Setting(card)
				.setName("Type value")
				.setDesc("Inline type:: value (leave empty to use emoji + label).")
				.addText((t) =>
					t.setValue(theme.type).onChange(async (v) => {
						theme.type = v;
						await plugin.saveSettings();
						bumpSettingsRevision();
					}),
				);

			new Setting(card)
				.setName("Journal")
				.setDesc("Optional journal:: value (e.g. Work).")
				.addText((t) =>
					t.setValue(theme.journal ?? "").onChange(async (v) => {
						theme.journal = v.trim() || undefined;
						await plugin.saveSettings();
						bumpSettingsRevision();
					}),
				);

			new Setting(card).addButton((btn) =>
				btn
					.setButtonText("Remove")
					.setWarning()
					.onClick(async () => {
						plugin.settings.quickNoteThemes = themes.filter((_, j) => j !== i);
						await plugin.saveSettings();
						bumpSettingsRevision();
						renderThemes();
					}),
			);
		}

		if (themes.length === 0) {
			listEl.createEl("p", {
				text: "No themes configured. Add one below or restore defaults.",
				cls: "fulcrum-muted",
			});
		}
	};

	renderThemes();

	new Setting(containerEl).addButton((btn) =>
		btn.setButtonText("Add theme").onClick(async () => {
			const themes = plugin.settings.quickNoteThemes ?? [];
			const label = "New theme";
			const base = slugifyId(label);
			themes.push({
				id: uniqueThemeId(themes, base),
				label,
				emoji: "📝",
				type: "",
			});
			plugin.settings.quickNoteThemes = themes;
			await plugin.saveSettings();
			bumpSettingsRevision();
			renderThemes();
		}),
	);

	new Setting(containerEl).addButton((btn) =>
		btn.setButtonText("Restore default themes").onClick(async () => {
			plugin.settings.quickNoteThemes = [...DEFAULT_QUICK_NOTE_THEMES];
			await plugin.saveSettings();
			bumpSettingsRevision();
			renderThemes();
			refresh();
		}),
	);
}
