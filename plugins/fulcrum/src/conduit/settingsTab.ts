import {Notice, Platform, Setting} from "obsidian";
import type FulcrumPlugin from "../main";
import {FulcrumSettingTab} from "../settings";
import {addConduitSyncSettingsRow} from "./actions";
import {findRemctlBinary} from "./remctlPath";
import {RemctlClient} from "./remctlClient";

function heading(containerEl: HTMLElement, text: string): void {
	containerEl.createEl("h3", {text, cls: "fulcrum-settings-heading"});
}

export function displayConduitSettings(containerEl: HTMLElement, plugin: FulcrumPlugin): void {
	heading(containerEl, "Conduit (Apple Reminders)");

	if (!Platform.isMacOS) {
		containerEl.createEl("p", {
			text: "Conduit syncs Fulcrum tasks with Apple Reminders via remctl on macOS only.",
			cls: "fulcrum-settings-lead",
		});
		return;
	}

	containerEl.createEl("p", {
		text: "Bidirectional sync for linked tasks (title, status, due date). Enable sync per project from the project header menu and choose a Reminders list manually. Tasks without a project use the Inbox list.",
		cls: "fulcrum-settings-lead",
	});

	new Setting(containerEl)
		.setName("Enable Conduit")
		.setDesc("Sync Fulcrum tasks with Apple Reminders using the remctl CLI.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitEnabled).onChange(async (v) => {
				plugin.settings.conduitEnabled = v;
				await plugin.saveSettings();
				await plugin.restartConduit();
			}),
		);

	if (!plugin.settings.conduitEnabled) return;

	const defer = plugin.conduit?.coordinator.getDeferReason();
	if (defer) {
		containerEl.createEl("p", {
			text: `Sync deferred: ${defer}`,
			cls: "fulcrum-muted",
		});
	}

	const remctlRow = new Setting(containerEl)
		.setName("remctl path")
		.setDesc(
			"Full path required — Obsidian does not use your shell PATH. Common: ~/.local/bin/remctl",
		);
	remctlRow.addText((t) => {
		const client = new RemctlClient(plugin.settings.conduitRemctlPath);
		t.setPlaceholder(client.resolvedPath)
			.setValue(plugin.settings.conduitRemctlPath)
			.onChange(async (v) => {
				plugin.settings.conduitRemctlPath = v;
				await plugin.saveSettings();
			});
	});
	remctlRow.addButton((b) =>
		b.setButtonText("Detect path").onClick(async () => {
			const found = findRemctlBinary();
			if (!found) {
				new Notice("remctl not found in ~/.local/bin, Homebrew, or /usr/local/bin.");
				return;
			}
			plugin.settings.conduitRemctlPath = found;
			await plugin.saveSettings();
			new Notice(`Using ${found}`);
			new FulcrumSettingTab(plugin.app, plugin).display();
		}),
	);
	textSetting(
		plugin,
		containerEl,
		"conduitVaultNameOverride",
		"Vault name override",
		"For obsidian:// links in Reminder notes (mobile). Empty uses this vault’s name.",
	);
	textSetting(plugin, containerEl, "conduitInboxListName", "Inbox list name", "Reminders list for tasks without a project.");
	textSetting(plugin, containerEl, "conduitReminderIdField", "Task reminder id field");
	textSetting(plugin, containerEl, "conduitReminderListIdField", "Project list id field");
	textSetting(plugin, containerEl, "conduitSyncField", "Project sync enabled field", "Frontmatter boolean set when a project syncs with Reminders.");
	textSetting(plugin, containerEl, "conduitArchivedListPrefix", "Archived list name prefix");

	new Setting(containerEl)
		.setName("Sync interval (seconds)")
		.setDesc("0 = manual only.")
		.addText((t) =>
			t
				.setValue(String(plugin.settings.conduitSyncIntervalSeconds))
				.onChange(async (v) => {
					const n = Math.max(0, Number.parseInt(v, 10) || 0);
					plugin.settings.conduitSyncIntervalSeconds = n;
					await plugin.saveSettings();
					plugin.conduit?.stop();
					await plugin.restartConduit();
				}),
		);

	new Setting(containerEl)
		.setName("Vault quiet period (seconds)")
		.setDesc("Wait after vault edits before auto sync (reduces Obsidian Sync race overwrites).")
		.addText((t) =>
			t
				.setValue(String(plugin.settings.conduitVaultQuietSeconds))
				.onChange(async (v) => {
					plugin.settings.conduitVaultQuietSeconds = Math.max(0, Number.parseInt(v, 10) || 60);
					await plugin.saveSettings();
				}),
		);

	new Setting(containerEl)
		.setName("Delete Reminders when task removed")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitDeleteReminderWhenTaskDeleted).onChange(async (v) => {
				plugin.settings.conduitDeleteReminderWhenTaskDeleted = v;
				await plugin.saveSettings();
			}),
		);

	new Setting(containerEl)
		.setName("Sync project colors to lists")
		.setDesc("Uses remctl list color (private API for custom hex).")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitSyncListColors).onChange(async (v) => {
				plugin.settings.conduitSyncListColors = v;
				await plugin.saveSettings();
			}),
		);

	new Setting(containerEl)
		.setName("Tag reminders with project Area")
		.setDesc("Adds the Area name as a Reminders tag for filtering.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitSyncAreaTags).onChange(async (v) => {
				plugin.settings.conduitSyncAreaTags = v;
				await plugin.saveSettings();
			}),
		);

	new Setting(containerEl)
		.setName("Show sync progress in status bar")
		.setDesc("Phase and task counts in the footer while Conduit runs. Toolbar badge always shows when syncing.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitShowSyncProgress).onChange(async (v) => {
				plugin.settings.conduitShowSyncProgress = v;
				await plugin.saveSettings();
			}),
		);

	addConduitSyncSettingsRow(containerEl, plugin);
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
		}),
	);
}
