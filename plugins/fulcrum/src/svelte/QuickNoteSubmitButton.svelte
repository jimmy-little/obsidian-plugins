<script lang="ts">
	import {Menu} from "obsidian";
	import type {QuickNoteTheme} from "../fulcrum/settingsDefaults";

	export let disabled = false;
	export let themes: QuickNoteTheme[] = [];
	export let onSubmit: (themeId?: string) => void;

	function openThemeMenu(ev: MouseEvent): void {
		const menu = new Menu();
		for (const theme of themes) {
			menu.addItem((item) => {
				item.setTitle(`${theme.emoji} ${theme.label}`.trim());
				item.onClick(() => onSubmit(theme.id));
			});
		}
		if (themes.length === 0) {
			menu.addItem((item) => {
				item.setTitle("No themes configured");
				item.setDisabled(true);
			});
		}
		menu.showAtMouseEvent(ev);
	}
</script>

<div class="fulcrum-quick-note-segmented" role="group" aria-label="Add quick note">
	<button
		type="button"
		class="fulcrum-quick-note-segmented__main fulcrum-quick-note-btn"
		{disabled}
		on:click={() => onSubmit()}
	>
		Add Quick Note
	</button>
	<button
		type="button"
		class="fulcrum-quick-note-segmented__chevron fulcrum-quick-note-btn"
		aria-label="Quick note themes"
		title="Quick note themes"
		{disabled}
		on:click={openThemeMenu}
	>
		▾
	</button>
</div>
