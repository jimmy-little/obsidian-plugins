import type {App, TFile} from "obsidian";
import {isFileInPeopleDirs} from "./pathUtils";

/** All markdown files under configured people directories. */
export function collectPeopleMarkdownFiles(app: App, peopleDirs: string[]): TFile[] {
	if (!peopleDirs.length) return [];
	return app.vault.getMarkdownFiles().filter((f) => isFileInPeopleDirs(f.path, peopleDirs));
}
