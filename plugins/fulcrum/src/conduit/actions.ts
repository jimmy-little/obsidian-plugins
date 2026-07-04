import {Platform, Setting} from "obsidian";
import type FulcrumPlugin from "../main";

export type ConduitActionId = "doctor" | "test-bridge";

export const CONDUIT_ACTIONS: {id: ConduitActionId; commandName: string; icon: string}[] = [
	{
		id: "doctor",
		commandName: "Test Reminders bridge",
		icon: "heart-pulse",
	},
];

export function conduitActionEnabled(plugin: FulcrumPlugin): boolean {
	return Platform.isMacOS && plugin.settings.conduitEnabled;
}

export function runConduitAction(plugin: FulcrumPlugin, id: ConduitActionId): void {
	if (!Platform.isMacOS) return;
	if (id === "doctor") {
		void plugin.conduitRunDoctor();
	}
}

export function registerConduitCommands(plugin: FulcrumPlugin): void {
	if (!Platform.isMacOS) return;
	for (const action of CONDUIT_ACTIONS) {
		plugin.addCommand({
			id: `conduit-${action.id}`,
			name: `Reminders: ${action.commandName}`,
			checkCallback: (checking) => {
				if (!conduitActionEnabled(plugin)) return false;
				if (!checking) runConduitAction(plugin, action.id);
				return true;
			},
		});
	}
}

export function addConduitBridgeSettingsRow(
	containerEl: HTMLElement,
	plugin: FulcrumPlugin,
): void {
	const row = new Setting(containerEl)
		.setName("Bridge actions")
		.setDesc("Test connection to remctl or the Fulcrum Bridge app.");

	row.addButton((btn) => {
		btn.setTooltip("Test Reminders bridge");
		btn.setIcon("heart-pulse");
		btn.onClick(() => runConduitAction(plugin, "doctor"));
	});
	row.controlEl.addClass("fulcrum-conduit-bridge-setting");
}
