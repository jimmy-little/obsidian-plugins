import {Platform, Setting} from "obsidian";
import type FulcrumPlugin from "../main";
import {heading, settingsLead} from "../settings/settingsHelpers";

export function displayOmniFocusSettings(
	containerEl: HTMLElement,
	plugin: FulcrumPlugin,
	refresh?: () => void,
): void {
	heading(containerEl, "OmniFocus sync");

	if (!Platform.isMacOS) {
		containerEl.createEl("p", {
			text: "OmniFocus two-way sync is available on macOS only.",
			cls: "fulcrum-settings-lead",
		});
		return;
	}

	settingsLead(
		containerEl,
		"Two-way mirror between Fulcrum tasks (task notes and inline checkboxes on linked projects) and OmniFocus. Mutually exclusive with the Reminders task backend. Recurring vault tasks are skipped. Connect a project from its menu, then Sync now.",
	);

	new Setting(containerEl)
		.setName("Enable OmniFocus sync")
		.setDesc("Requires OmniFocus running (typically Pro) and Fulcrum Bridge. Disables Reminders task sync.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.omnifocusEnabled).onChange(async (v) => {
				plugin.settings.omnifocusEnabled = v;
				if (v) plugin.settings.conduitEnabled = false;
				await plugin.saveSettings();
				await plugin.restartConduit();
				await plugin.restartOmniFocus();
				refresh?.();
			}),
		);

	if (!plugin.settings.omnifocusEnabled) return;

	new Setting(containerEl)
		.setName("Bridge URL")
		.setDesc("Same Fulcrum Bridge HTTP API as Calendar (default http://127.0.0.1:9247).")
		.addText((t) =>
			t.setValue(plugin.settings.omnifocusBridgeUrl || plugin.settings.remindersBridgeUrl).onChange(async (v) => {
				plugin.settings.omnifocusBridgeUrl = v;
				await plugin.saveSettings();
				plugin.omnifocus?.invalidate();
			}),
		);

	new Setting(containerEl)
		.setName("Poll interval (seconds)")
		.setDesc("0 = manual sync only (command palette: OmniFocus: Sync now).")
		.addText((t) =>
			t.setValue(String(plugin.settings.omnifocusPollSeconds)).onChange(async (v) => {
				const n = Number(v);
				plugin.settings.omnifocusPollSeconds = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 30;
				await plugin.saveSettings();
				await plugin.restartOmniFocus();
			}),
		);

	new Setting(containerEl)
		.setName("Pull OmniFocus Inbox")
		.setDesc("Create vault task notes for incomplete Inbox items that are not already linked.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.omnifocusSyncInbox).onChange(async (v) => {
				plugin.settings.omnifocusSyncInbox = v;
				await plugin.saveSettings();
			}),
		);

	new Setting(containerEl)
		.setName("Test OmniFocus bridge")
		.setDesc("Calls /omnifocus/health (installed, running, OmniJS).")
		.addButton((btn) => {
			btn.setButtonText("Test").onClick(() => {
				void plugin.omnifocusRunDoctor();
			});
		})
		.addButton((btn) => {
			btn.setButtonText("Sync now").onClick(async () => {
				btn.setDisabled(true);
				try {
					await plugin.omnifocusSyncNow();
				} finally {
					btn.setDisabled(false);
				}
			});
		});
}
