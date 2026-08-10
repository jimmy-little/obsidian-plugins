import type {EventRef, TFile} from "obsidian";
import type FulcrumPlugin from "../main";
import type {OrbitHost} from "./orbit/pluginHost";
import {createOrbitSettingsProxy} from "./orbit/orbitSettingsProxy";

/** Build OrbitHost adapter backed by FulcrumPlugin. */
export function createOrbitHost(plugin: FulcrumPlugin): OrbitHost {
	const settingsProxy = createOrbitSettingsProxy(plugin.settings);
	return {
		get app() {
			return plugin.app;
		},
		get settings() {
			return settingsProxy;
		},
		registerEvent: (ref: EventRef) => plugin.registerEvent(ref),
		saveSettings: () => plugin.saveSettings(),
		openMarkdownFile: (file) => plugin.openPersonMarkdownFile(file),
		appendQuickNote: (personFile, text) => plugin.appendPersonQuickNote(personFile, text),
		renderActivityPreview: (el, sourcePath, markdown) =>
			plugin.renderOrbitActivityPreview(el, sourcePath, markdown),
		openOrgChartForAnchor: (anchorPath) => plugin.openOrgChartForAnchor(anchorPath),
		openPersonProfileInMain: (personPath) => plugin.openPersonInOrbitMode(personPath),
		capturePersonSnapshot: (personFile) => plugin.capturePersonSnapshot(personFile),
		openPersonProperties: (personFile) => plugin.openPersonProperties(personFile),
		createPersonNote: (linkText, displayName) => plugin.createPersonNote(linkText, displayName),
		getPersonWorksWith: (personPath) => plugin.vaultIndex.getPersonWorksWith(personPath),
	};
}
