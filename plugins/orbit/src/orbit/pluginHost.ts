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
};
