import {Notice, Platform, Setting} from "obsidian";
import type FulcrumPlugin from "../main";
import {addConduitBridgeSettingsRow} from "./actions";
import {
	cleanupRemindersConduitMetadata,
	cleanupVaultConduitMetadata,
} from "./conduitMigration";
import {findRemctlBinary} from "./remctlPath";
import {RemctlClient} from "./remctlClient";

function heading(containerEl: HTMLElement, text: string): void {
	containerEl.createEl("h3", {text, cls: "fulcrum-settings-heading"});
}

export function displayConduitSettings(
	containerEl: HTMLElement,
	plugin: FulcrumPlugin,
	refresh?: () => void,
): void {
	heading(containerEl, "Reminders bridge");

	if (!Platform.isMacOS) {
		containerEl.createEl("p", {
			text: "Apple Reminders integration is available on macOS only.",
			cls: "fulcrum-settings-lead",
		});
		return;
	}

	containerEl.createEl("p", {
		text: "Live Reminders views in notes (fulcrum-reminders code blocks) and one-way convert actions. Tasks live in Obsidian or Reminders — not both. Use the Fulcrum Bridge app or remctl for API access.",
		cls: "fulcrum-settings-lead",
	});

	new Setting(containerEl)
		.setName("Enable Reminders bridge")
		.setDesc("Query blocks and convert actions for Apple Reminders.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitEnabled).onChange(async (v) => {
				plugin.settings.conduitEnabled = v;
				await plugin.saveSettings();
				await plugin.restartConduit();
			}),
		);

	if (!plugin.settings.conduitEnabled) return;

	textSetting(
		plugin,
		containerEl,
		"remindersBridgeUrl",
		"Bridge URL",
		"Fulcrum Bridge HTTP API (default http://127.0.0.1:9247). Falls back to remctl when unreachable.",
	);
	textSetting(plugin, containerEl, "remindersBridgeToken", "Bridge token (optional)");

	const remctlRow = new Setting(containerEl)
		.setName("remctl path (fallback)")
		.setDesc("Used when the HTTP bridge is unavailable. Full path required.");
	remctlRow.addText((t) => {
		const client = new RemctlClient(plugin.settings.conduitRemctlPath);
		t.setPlaceholder(client.resolvedPath)
			.setValue(plugin.settings.conduitRemctlPath)
			.onChange(async (v) => {
				plugin.settings.conduitRemctlPath = v;
				await plugin.saveSettings();
				plugin.conduit?.invalidateBridge();
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
			plugin.conduit?.invalidateBridge();
			new Notice(`Using ${found}`);
			refresh?.();
		}),
	);

	textSetting(
		plugin,
		containerEl,
		"conduitInboxListName",
		"Inbox list name",
		"Default Reminders list when converting tasks without a project list.",
	);
	textSetting(plugin, containerEl, "conduitReminderListIdField", "Project list id field");
	textSetting(
		plugin,
		containerEl,
		"taskNotesArchiveFolder",
		"Task note archive folder",
		"Where task notes move after Convert to Reminder.",
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
		.setDesc("When setting a project's Reminders list, apply project color.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitSyncListColors).onChange(async (v) => {
				plugin.settings.conduitSyncListColors = v;
				await plugin.saveSettings();
			}),
		);

	addConduitBridgeSettingsRow(containerEl, plugin);

	heading(containerEl, "Migration from Conduit sync");
	containerEl.createEl("p", {
		text: "If you used bidirectional Conduit sync, remove leftover links in the vault and Reminders.",
		cls: "fulcrum-settings-lead",
	});
	new Setting(containerEl)
		.setName("Clean up vault metadata")
		.setDesc("Remove appleReminderId frontmatter, inline reminder-id comments, and conduitSync from projects.")
		.addButton((btn) => {
			btn.setButtonText("Clean vault").onClick(() => {
				void (async () => {
					try {
						const result = await cleanupVaultConduitMetadata(plugin);
						const total =
							result.taskNotesCleared +
							result.inlineCommentsCleared +
							result.projectSyncFieldsCleared;
						if (total === 0) {
							new Notice("No legacy Conduit metadata found in the vault.");
							return;
						}
						new Notice(
							`Removed legacy Conduit metadata (${result.taskNotesCleared} task notes, ${result.inlineCommentsCleared} inline lines, ${result.projectSyncFieldsCleared} projects).`,
						);
					} catch (e) {
						console.error(e);
						new Notice("Could not clean up vault Conduit metadata.");
					}
				})();
			});
		});
	new Setting(containerEl)
		.setName("Clean up Reminders metadata")
		.setDesc("Strip obsidian:// links and area tags from reminders in project-linked lists.")
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
			}
		}),
	);
}
