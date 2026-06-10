import {Platform, Setting} from "obsidian";
import type FulcrumPlugin from "../main";
import type {ConduitSyncForce} from "./types";

export type ConduitActionId =
	| "sync"
	| "pull"
	| "push"
	| "force-pull"
	| "force-push"
	| "doctor";

export interface ConduitSyncActionDef {
	id: ConduitActionId;
	/** Command palette label (prefixed with “Conduit: ” when registered). */
	commandName: string;
	label: string;
	icon: string;
	toolbar?: boolean;
	confirm?: string;
}

export const CONDUIT_SYNC_ACTIONS: ConduitSyncActionDef[] = [
	{
		id: "sync",
		commandName: "Sync with Reminders",
		label: "Sync now (pull and push)",
		icon: "refresh-cw",
		toolbar: true,
	},
	{
		id: "pull",
		commandName: "Pull from Reminders",
		label: "Pull from Reminders",
		icon: "download",
		toolbar: true,
	},
	{
		id: "push",
		commandName: "Push to Reminders",
		label: "Push to Reminders",
		icon: "upload",
		toolbar: true,
	},
	{
		id: "force-pull",
		commandName: "Force pull from Reminders",
		label: "Force pull (overwrite vault from Reminders)",
		icon: "arrow-down-to-line",
	},
	{
		id: "force-push",
		commandName: "Force push to Reminders",
		label: "Force push (overwrite Reminders from vault)",
		icon: "arrow-up-to-line",
		confirm: "Force push overwrites Reminders with vault data. Continue?",
	},
	{
		id: "doctor",
		commandName: "Run remctl doctor",
		label: "Run remctl doctor",
		icon: "heart-pulse",
	},
];

export function conduitActionEnabled(plugin: FulcrumPlugin): boolean {
	return Platform.isMacOS && plugin.settings.conduitEnabled;
}

export function runConduitAction(
	plugin: FulcrumPlugin,
	id: ConduitActionId,
	projectPath?: string,
): void {
	if (!Platform.isMacOS) return;
	const def = CONDUIT_SYNC_ACTIONS.find((a) => a.id === id);
	if (def?.confirm && !window.confirm(def.confirm)) return;

	const opts = actionSyncOpts(id);
	if (id === "doctor") {
		void plugin.conduitRunDoctor();
		return;
	}
	void plugin.conduitSyncNow({...opts, projectPath});
}

export function runConduitProjectAction(
	plugin: FulcrumPlugin,
	projectPath: string,
	id: "sync" | "pull" | "push",
): void {
	runConduitAction(plugin, id, projectPath);
}

function actionSyncOpts(id: ConduitActionId): {
	force?: ConduitSyncForce;
	skipQuiet?: boolean;
} {
	switch (id) {
		case "sync":
			return {skipQuiet: false};
		case "pull":
		case "force-pull":
			return {force: "pull", skipQuiet: true};
		case "push":
		case "force-push":
			return {force: "push", skipQuiet: true};
		default:
			return {};
	}
}

export function registerConduitCommands(plugin: FulcrumPlugin): void {
	if (!Platform.isMacOS) return;
	for (const action of CONDUIT_SYNC_ACTIONS) {
		plugin.addCommand({
			id: `conduit-${action.id}`,
			name: `Conduit: ${action.commandName}`,
			checkCallback: (checking) => {
				if (!conduitActionEnabled(plugin)) return false;
				if (!checking) runConduitAction(plugin, action.id);
				return true;
			},
		});
	}
}

export function addConduitSyncSettingsRow(
	containerEl: HTMLElement,
	plugin: FulcrumPlugin,
): void {
	const row = new Setting(containerEl)
		.setName("Sync actions")
		.setDesc("Manual Reminders sync. Same actions as the task view toolbar and command palette.");

	for (const action of CONDUIT_SYNC_ACTIONS) {
		row.addButton((btn) => {
			btn.setTooltip(action.label);
			btn.setIcon(action.icon);
			btn.onClick(() => runConduitAction(plugin, action.id));
		});
	}
	row.controlEl.addClass("fulcrum-conduit-sync-setting");
}
