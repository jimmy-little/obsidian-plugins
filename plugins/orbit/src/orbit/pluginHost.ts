import type {App} from "obsidian";
import type {OrbitSettings} from "./settings";

/** Narrow surface passed into Svelte (avoids circular imports with `main.ts`). */
export type OrbitHost = {
	app: App;
	settings: OrbitSettings;
	saveSettings: () => Promise<void>;
	openMarkdownFile: (file: import("obsidian").TFile) => Promise<void>;
	appendQuickNote: (personFile: import("obsidian").TFile, text: string) => Promise<void>;
};
