import { setIcon } from "obsidian";
import type PulsePlugin from "../main";

const SCAN_LABEL = "Scan for Health and Workout Imports";

/** Icon button that runs the same import scan as the command palette action. */
export function appendScanRefreshButton(plugin: PulsePlugin, actions: HTMLElement): void {
	const btn = actions.createEl("button", {
		type: "button",
		cls: "pulse-pm__head-btn pulse-pm__head-btn--icon-only clickable-icon",
		attr: { "aria-label": SCAN_LABEL, title: SCAN_LABEL },
	});
	setIcon(btn.createSpan({ cls: "pulse-pm__head-btn__icon" }), "refresh-cw");
	btn.addEventListener("click", () => {
		void plugin.importManager.scanAndImport();
	});
}

/** Standard main-pane header row: title + scan refresh. */
export function createMainHeadWithRefresh(
	container: HTMLElement,
	title: string,
	plugin: PulsePlugin,
): HTMLElement {
	const header = container.createDiv({ cls: "pulse-pm__main-head" });
	const row = header.createDiv({ cls: "pulse-pm__main-head-row" });
	row.createEl("h2", { text: title, cls: "pulse-pm__main-title" });
	const actions = row.createDiv({ cls: "pulse-pm__main-head-actions" });
	appendScanRefreshButton(plugin, actions);
	return header;
}
