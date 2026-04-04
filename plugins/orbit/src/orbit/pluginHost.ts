import type {App, EventRef} from "obsidian";
import type {OrbitSettings} from "./settings";

/** Narrow surface passed into Svelte (avoids circular imports with `main.ts`). */
export type OrbitHost = {
	app: App;
	settings: OrbitSettings;
	registerEvent: (ref: EventRef) => void;
	saveSettings: () => Promise<void>;
	openMarkdownFile: (file: import("obsidian").TFile) => Promise<void>;
	appendQuickNote: (personFile: import("obsidian").TFile, text: string) => Promise<void>;
	renderActivityPreview: (el: HTMLElement, sourcePath: string, markdown: string) => Promise<void>;
	openOrgChartForAnchor: (anchorPath: string) => Promise<void>;
	/**
	 * Open the Orbit person profile in the main editor area (when the picker lives in a sidebar).
	 */
	openPersonProfileInMain: (personPath: string) => Promise<void>;
	/** Write or replace the HTML-comment snapshot block on the person note. */
	capturePersonSnapshot: (personFile: import("obsidian").TFile) => Promise<void>;
	/** Edit YAML properties in a modal (links / tags / vault value hints) without leaving Orbit. */
	openPersonProperties: (personFile: import("obsidian").TFile) => void;
};
