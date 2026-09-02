import {Setting, setIcon} from "obsidian";
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

function reorderThemes(themes: QuickNoteTheme[], from: number, to: number): QuickNoteTheme[] {
	if (from === to) return themes;
	const next = [...themes];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item!);
	return next;
}

export function renderQuickNotesTab(ctx: SettingsContext): void {
	const {containerEl, plugin, refresh} = ctx;
	settingsLead(
		containerEl,
		"Themes appear in the quick note dropdown on project pages. Each theme adds inline fields (type, entry, journal) to the Fulcrum log entry.",
	);
	heading(containerEl, "Quick note themes");

	const listEl = containerEl.createDiv({cls: "fulcrum-quick-note-themes-list"});
	let dragFromIndex: number | null = null;

	const renderThemes = (): void => {
		listEl.empty();
		const themes = plugin.settings.quickNoteThemes ?? [];

		for (let i = 0; i < themes.length; i++) {
			const theme = themes[i]!;
			const row = listEl.createDiv({cls: "fulcrum-quick-note-theme-row"});

			const grip = row.createSpan({
				cls: "fulcrum-quick-note-theme-row__grip",
				attr: {
					draggable: "true",
					role: "button",
					tabindex: "0",
					"aria-label": "Drag to reorder",
				},
			});
			grip.setText("⋮⋮");

			const fields = row.createDiv({cls: "fulcrum-quick-note-theme-row__fields"});

			const emojiInput = fields.createEl("input", {
				type: "text",
				cls: "fulcrum-quick-note-theme-row__emoji",
				attr: {placeholder: "Emoji", "aria-label": "Emoji"},
			});
			emojiInput.value = theme.emoji;
			emojiInput.addEventListener("input", () => {
				theme.emoji = emojiInput.value;
				void plugin.saveSettings().then(() => bumpSettingsRevision());
			});

			const labelInput = fields.createEl("input", {
				type: "text",
				cls: "fulcrum-quick-note-theme-row__label",
				attr: {placeholder: "Label", "aria-label": "Label"},
			});
			labelInput.value = theme.label;
			labelInput.addEventListener("input", () => {
				theme.label = labelInput.value;
				void plugin.saveSettings().then(() => bumpSettingsRevision());
			});

			const journalInput = fields.createEl("input", {
				type: "text",
				cls: "fulcrum-quick-note-theme-row__journal",
				attr: {placeholder: "Journal", "aria-label": "Journal"},
			});
			journalInput.value = theme.journal ?? "";
			journalInput.addEventListener("input", () => {
				theme.journal = journalInput.value.trim() || undefined;
				void plugin.saveSettings().then(() => bumpSettingsRevision());
			});

			const deleteBtn = row.createEl("button", {
				type: "button",
				cls: "fulcrum-quick-note-theme-row__delete clickable-icon",
				attr: {"aria-label": "Remove theme"},
			});
			setIcon(deleteBtn, "trash");
			deleteBtn.addEventListener("click", async () => {
				plugin.settings.quickNoteThemes = themes.filter((_, j) => j !== i);
				await plugin.saveSettings();
				bumpSettingsRevision();
				renderThemes();
			});

			grip.addEventListener("dragstart", (e) => {
				dragFromIndex = i;
				row.addClass("fulcrum-quick-note-theme-row--dragging");
				e.dataTransfer?.setData("text/plain", String(i));
				if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
			});

			grip.addEventListener("dragend", () => {
				dragFromIndex = null;
				row.removeClass("fulcrum-quick-note-theme-row--dragging");
				listEl
					.querySelectorAll(".fulcrum-quick-note-theme-row--drag-over")
					.forEach((el) => el.removeClass("fulcrum-quick-note-theme-row--drag-over"));
			});

			row.addEventListener("dragover", (e) => {
				e.preventDefault();
				if (dragFromIndex === null || dragFromIndex === i) return;
				if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
				row.addClass("fulcrum-quick-note-theme-row--drag-over");
			});

			row.addEventListener("dragleave", (e) => {
				if (e.currentTarget === e.target || !row.contains(e.relatedTarget as Node)) {
					row.removeClass("fulcrum-quick-note-theme-row--drag-over");
				}
			});

			row.addEventListener("drop", async (e) => {
				e.preventDefault();
				row.removeClass("fulcrum-quick-note-theme-row--drag-over");
				const from = dragFromIndex;
				dragFromIndex = null;
				if (from === null || from === i) return;
				plugin.settings.quickNoteThemes = reorderThemes(themes, from, i);
				await plugin.saveSettings();
				bumpSettingsRevision();
				renderThemes();
			});
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
