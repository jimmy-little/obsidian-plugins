import {Platform} from "obsidian";
import type FulcrumPlugin from "../main";
import {OmniFocusSyncService} from "./syncService";

export function registerOmniFocusCommands(plugin: FulcrumPlugin): void {
	if (!Platform.isMacOS) return;
	plugin.addCommand({
		id: "omnifocus-doctor",
		name: "OmniFocus: Test bridge",
		checkCallback: (checking) => {
			if (!plugin.settings.omnifocusEnabled) return false;
			if (!checking) void plugin.omnifocusRunDoctor();
			return true;
		},
	});
	plugin.addCommand({
		id: "omnifocus-sync-now",
		name: "OmniFocus: Sync now",
		checkCallback: (checking) => {
			if (!OmniFocusSyncService.canRun(plugin.settings)) return false;
			if (!checking) void plugin.omnifocusSyncNow();
			return true;
		},
	});
}
