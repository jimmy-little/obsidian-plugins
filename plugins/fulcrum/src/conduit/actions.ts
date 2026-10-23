import {Platform, Setting} from "obsidian";
import type FulcrumPlugin from "../main";
import {RemindersSyncService} from "./syncService";

export type ConduitActionId = "doctor" | "sync-now";

export const CONDUIT_ACTIONS: {id: ConduitActionId; commandName: string; icon: string}[] = [
	{
		id: "doctor",
		commandName: "Test bridge",
		icon: "heart-pulse",
	},
	{
		id: "sync-now",
		commandName: "Sync now",
		icon: "refresh-cw",
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
	if (id === "sync-now") {
		void plugin.remindersSyncNow();
	}
}

export function registerConduitCommands(plugin: FulcrumPlugin): void {
	if (!Platform.isMacOS) return;
	for (const action of CONDUIT_ACTIONS) {
		plugin.addCommand({
			id: `conduit-${action.id}`,
			name: `Reminders: ${action.commandName}`,
			checkCallback: (checking) => {
				if (action.id === "sync-now" && !RemindersSyncService.canRun(plugin.settings)) {
					return false;
				}
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
		.setDesc("Test Fulcrum Bridge and run a Reminders sync pass.");

	row.addButton((btn) => {
		btn.setTooltip("Test Reminders bridge");
		btn.setIcon("heart-pulse");
		btn.onClick(() => runConduitAction(plugin, "doctor"));
	});
	row.addButton((btn) => {
		btn.setButtonText("Sync now");
		btn.onClick(async () => {
			btn.setDisabled(true);
			try {
				await plugin.remindersSyncNow();
			} finally {
				btn.setDisabled(false);
			}
		});
	});
	row.controlEl.addClass("fulcrum-conduit-bridge-setting");
}
