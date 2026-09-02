import {Notice, Platform, Setting} from "obsidian";
import {addConduitBridgeSettingsRow} from "../../conduit/actions";
import {
	joinCalendarIds,
	loadBridgeCalendarRows,
	parseCalendarIdList,
	renderCalendarIdPicker,
} from "../../conduit/bridgeCalendarSettings";
import type FulcrumPlugin from "../../main";
import {heading, settingsLead} from "../settingsHelpers";
import type {SettingsContext} from "../settingsContext";

const BRIDGE_BUILD_STEPS = `1. Open Terminal and run:
   cd plugins/fulcrum-bridge
   ./build.sh
2. Install or run the bridge:
   ./install-daemon.sh
   — or for a one-off test: open .build/FulcrumBridge.app
3. On first launch, grant Reminders and Calendar access in the macOS permission prompt.
4. If access was denied, open System Settings → Privacy & Security → Reminders and Calendar, and enable FulcrumBridge.
5. Default URL: http://127.0.0.1:9247 — set the same URL below when the bridge is enabled.`;

async function renderCalendarPickers(
	containerEl: HTMLElement,
	plugin: FulcrumPlugin,
): Promise<void> {
	const host = containerEl.createDiv({cls: "fulcrum-bridge-calendar-settings"});
	host.createEl("p", {text: "Loading calendars…", cls: "fulcrum-muted"});

	const {rows, error} = await loadBridgeCalendarRows(plugin);
	host.empty();

	if (error) {
		host.createEl("p", {text: error, cls: "fulcrum-muted"});
	}

	const forecastIds = parseCalendarIdList(plugin.settings.forecastCalendarIds);
	renderCalendarIdPicker(host, {
		sectionTitle: "Horizon calendars",
		sectionDesc:
			"Read-only events in the Horizon day list. The gear icon in Horizon opens the same options.",
		rows,
		selectedIds: forecastIds,
		onToggle: async (ids) => {
			plugin.settings.forecastCalendarIds = joinCalendarIds(ids);
			await plugin.saveSettings();
		},
	});

	const overlayIds = parseCalendarIdList(plugin.settings.remindersCalendarIds);
	renderCalendarIdPicker(host, {
		sectionTitle: "Calendar view overlay",
		sectionDesc: "Read-only events in the Calendar view (dashed blocks).",
		rows,
		selectedIds: overlayIds,
		onToggle: async (ids) => {
			plugin.settings.remindersCalendarIds = joinCalendarIds(ids);
			await plugin.saveSettings();
		},
	});
}

export function renderCalendarIntegrationSection(
	ctx: SettingsContext,
	plugin: FulcrumPlugin,
	refresh?: () => void,
): void {
	const {containerEl} = ctx;

	heading(containerEl, "Calendar integration");
	if (!Platform.isMacOS) {
		containerEl.createEl("p", {
			text: "macOS system calendar access requires the Fulcrum Bridge helper app (macOS only).",
			cls: "fulcrum-settings-lead",
		});
		return;
	}

	settingsLead(
		containerEl,
		"Fulcrum Bridge reads your macOS calendars for Forecast and the Calendar view. Install and run the helper app, enable the bridge below, then pick calendars.",
	);

	const installPre = containerEl.createEl("pre", {
		cls: "fulcrum-settings-uri",
		text: BRIDGE_BUILD_STEPS,
	});
	installPre.style.whiteSpace = "pre-wrap";
	installPre.style.wordBreak = "break-word";

	new Setting(containerEl)
		.setName("Enable Fulcrum Bridge")
		.setDesc("Required for system calendar events in Forecast and Reminders integration. OmniFocus sync uses the same helper without this toggle.")
		.addToggle((tg) =>
			tg.setValue(plugin.settings.conduitEnabled).onChange(async (v) => {
				plugin.settings.conduitEnabled = v;
				await plugin.saveSettings();
				await plugin.restartConduit();
				refresh?.();
			}),
		);

	if (!plugin.settings.conduitEnabled && !plugin.settings.omnifocusEnabled) return;

	new Setting(containerEl)
		.setName("Bridge URL")
		.setDesc("Fulcrum Bridge HTTP API (default http://127.0.0.1:9247).")
		.addText((t) =>
			t.setValue(plugin.settings.remindersBridgeUrl).onChange(async (v) => {
				plugin.settings.remindersBridgeUrl = v;
				await plugin.saveSettings();
				plugin.conduit?.invalidateBridge();
			}),
		);
	new Setting(containerEl)
		.setName("Bridge token (optional)")
		.addText((t) =>
			t.setValue(plugin.settings.remindersBridgeToken).onChange(async (v) => {
				plugin.settings.remindersBridgeToken = v;
				await plugin.saveSettings();
				plugin.conduit?.invalidateBridge();
			}),
		);

	addConduitBridgeSettingsRow(containerEl, plugin);

	new Setting(containerEl)
		.setName("Test calendar bridge")
		.setDesc("Checks HTTP health and calendar authorization.")
		.addButton((btn) => {
			btn.setButtonText("Test").onClick(() => {
				void (async () => {
					btn.setDisabled(true);
					try {
						plugin.conduit?.invalidateBridge();
						await plugin.conduitRunDoctor();
						new Notice("Bridge connection OK.");
						refresh?.();
					} catch (e) {
						console.error(e);
						const msg = e instanceof Error ? e.message : String(e);
						new Notice(msg.length < 120 ? msg : "Bridge test failed.");
					} finally {
						btn.setDisabled(false);
					}
				})();
			});
		});

	void renderCalendarPickers(containerEl, plugin);
}
