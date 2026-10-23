import {Notice, Platform, Setting} from "obsidian";
import type FulcrumPlugin from "../main";
import {addConduitBridgeSettingsRow} from "./actions";
import {cleanupRemindersConduitMetadata} from "./conduitMigration";
import {heading, settingsLead} from "../settings/settingsHelpers";
import {bumpSettingsRevision} from "../fulcrum/stores";
import {parseRemindersOpenTarget} from "./mapping";

export function displayConduitSettings(
	containerEl: HTMLElement,
	plugin: FulcrumPlugin,
	refresh?: () => void,
): void {
	heading(containerEl, "Reminders sync");

	if (!Platform.isMacOS) {
		containerEl.createEl("p", {
			text: "Apple Reminders two-way sync is available on macOS only.",
			cls: "fulcrum-settings-lead",
		});
		return;
	}

	settingsLead(
		containerEl,
		"Two-way mirror between Fulcrum tasks (task notes and inline checkboxes on linked projects) and Apple Reminders via Fulcrum Bridge (EventKit). Mutually exclusive with OmniFocus. Recurring vault tasks and recurring Reminders are skipped. Connect a project from its menu, then Sync now. iPhone captures land in the vault after iCloud reaches this Mac.",
	);

	new Setting(containerEl)
		.setName("Enable Reminders sync")
		.setDesc("Requires Fulcrum Bridge with Reminders permission. Disables OmniFocus two-way sync.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitEnabled).onChange(async (v) => {
				plugin.settings.conduitEnabled = v;
				if (v) plugin.settings.omnifocusEnabled = false;
				await plugin.saveSettings();
				bumpSettingsRevision();
				await plugin.restartConduit();
				await plugin.restartOmniFocus();
				refresh?.();
			}),
		);

	if (!plugin.settings.conduitEnabled) return;

	new Setting(containerEl)
		.setName("Header pill")
		.setDesc("Where the project header pill opens when a Reminders list is linked.")
		.addDropdown((d) =>
			d
				.addOption("reminders", "Open Reminders")
				.addOption("goodtask", "Open GoodTask")
				.setValue(parseRemindersOpenTarget(plugin.settings.remindersOpenTarget))
				.onChange(async (v) => {
					plugin.settings.remindersOpenTarget = parseRemindersOpenTarget(v);
					await plugin.saveSettings();
					bumpSettingsRevision();
				}),
		);

	textSetting(
		plugin,
		containerEl,
		"remindersBridgeUrl",
		"Bridge URL",
		"Fulcrum Bridge HTTP API (default http://127.0.0.1:9247).",
	);
	textSetting(plugin, containerEl, "remindersBridgeToken", "Bridge token (optional)");

	new Setting(containerEl)
		.setName("Poll interval (seconds)")
		.setDesc("0 = no interval. EventKit changes still wake sync every few seconds while enabled.")
		.addText((t) =>
			t.setValue(String(plugin.settings.remindersPollSeconds)).onChange(async (v) => {
				const n = Number(v);
				plugin.settings.remindersPollSeconds = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 30;
				await plugin.saveSettings();
				await plugin.restartConduit();
			}),
		);

	new Setting(containerEl)
		.setName("Pull default Reminders list")
		.setDesc("Create vault task notes for incomplete items on the Mac default Reminders list that are not already linked.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.remindersSyncInbox).onChange(async (v) => {
				plugin.settings.remindersSyncInbox = v;
				await plugin.saveSettings();
			}),
		);

	textSetting(
		plugin,
		containerEl,
		"conduitInboxListName",
		"Inbox list name",
		"Fallback Reminders list when converting unlinked tasks without a project list.",
	);
	textSetting(plugin, containerEl, "conduitReminderListIdField", "Project list id field");
	textSetting(
		plugin,
		containerEl,
		"taskNotesArchiveFolder",
		"Task note archive folder",
		"Where task notes move after Convert to Reminder (unlinked lists only).",
	);

	new Setting(containerEl)
		.setName("Query block refresh (seconds)")
		.setDesc("Auto-refresh fulcrum-reminders blocks. 0 = manual only.")
		.addText((t) =>
			t
				.setValue(String(plugin.settings.remindersQueryRefreshSeconds))
				.onChange(async (v) => {
					plugin.settings.remindersQueryRefreshSeconds = Math.max(
						0,
						Number.parseInt(v, 10) || 0,
					);
					await plugin.saveSettings();
				}),
		);

	new Setting(containerEl)
		.setName("Sync project colors to lists")
		.setDesc("When setting a project's Reminders list, apply project color (best-effort in EventKit).")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitSyncListColors).onChange(async (v) => {
				plugin.settings.conduitSyncListColors = v;
				await plugin.saveSettings();
			}),
		);

	addConduitBridgeSettingsRow(containerEl, plugin);

	heading(containerEl, "Migration from remctl / Conduit");
	containerEl.createEl("p", {
		text: "Optional: strip leftover obsidian:// links from Reminder notes. Join IDs (appleReminderId) are kept for two-way sync.",
		cls: "fulcrum-settings-lead",
	});
	new Setting(containerEl)
		.setName("Clean up Reminders notes")
		.setDesc("Strip obsidian:// links from reminders in project-linked lists.")
		.addButton((btn) => {
			btn.setButtonText("Clean Reminders").onClick(() => {
				void (async () => {
					try {
						const {updated, scanned} = await cleanupRemindersConduitMetadata(plugin);
						if (updated === 0) {
							new Notice(
								scanned > 0
									? `Scanned ${scanned} reminders — no Conduit metadata to remove.`
									: "No reminders in linked project lists.",
							);
							return;
						}
						new Notice(`Cleaned Conduit metadata from ${updated} reminder(s).`);
					} catch (e) {
						console.error(e);
						const msg = e instanceof Error ? e.message : String(e);
						new Notice(msg.length < 120 ? msg : "Could not clean up Reminders metadata.");
					}
				})();
			});
		});
}

function textSetting(
	plugin: FulcrumPlugin,
	containerEl: HTMLElement,
	key: keyof FulcrumPlugin["settings"],
	name: string,
	desc?: string,
): void {
	const row = new Setting(containerEl).setName(name);
	if (desc) row.setDesc(desc);
	const v = plugin.settings[key];
	const str = typeof v === "string" ? v : String(v);
	row.addText((t) =>
		t.setValue(str).onChange(async (value) => {
			(plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
			await plugin.saveSettings();
			if (key === "remindersBridgeUrl" || key === "remindersBridgeToken") {
				plugin.conduit?.invalidateBridge();
				plugin.remindersSync?.invalidate();
			}
		}),
	);
}
