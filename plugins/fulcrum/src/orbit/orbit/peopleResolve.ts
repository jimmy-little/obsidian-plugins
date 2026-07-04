export {
	buildPeopleDirsMatchIndex,
	lookupPeopleFileByAlias,
	normalizePersonMatchKey,
	personFileMatchKeys,
	resolvePersonLinkInDirs as resolvePersonLink,
	type ResolvedPersonLink,
} from "../../fulcrum/people/resolve";

import type {TFile, App} from "obsidian";
import type {OrbitSettings} from "./settings";
import {
	buildPeopleDirsMatchIndex,
	resolvePersonLinkInDirs,
	type ResolvedPersonLink,
} from "../../fulcrum/people/resolve";

export function resolvePersonLinksFromSettings(
	app: App,
	linkText: string,
	displayNameHint: string,
	sourcePath: string,
	settings: OrbitSettings,
	matchIndex?: Map<string, TFile>,
): ResolvedPersonLink {
	const index = matchIndex ?? buildPeopleDirsMatchIndex(app, settings.peopleDirs);
	return resolvePersonLinkInDirs(
		app,
		linkText,
		displayNameHint,
		sourcePath,
		settings.peopleDirs,
		index,
	);
}
