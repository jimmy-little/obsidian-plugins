import type FulcrumPlugin from "../main";

export type SettingsTabId =
	| "indexing"
	| "metadata"
	| "tasks"
	| "projects"
	| "quickNotes"
	| "views"
	| "timer"
	| "orbit"
	| "integrations";

export interface SettingsContext {
	plugin: FulcrumPlugin;
	containerEl: HTMLElement;
	refresh: () => void;
}

export type SettingsTabRender = (ctx: SettingsContext) => void;
