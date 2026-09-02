import {Notice, Setting} from "obsidian";
import {getTaskNotesHealth} from "../../fulcrum/taskNotesApi";
import {displayConduitSettings} from "../../conduit/settingsTab";
import {displayOmniFocusSettings} from "../../omnifocus/settingsTab";
import {renderCalendarIntegrationSection} from "./calendarIntegration";
import type {SettingsContext} from "../settingsContext";
import {heading, metadataGroup, settingsLead, textSetting} from "../settingsHelpers";

const FULCRUM_URI_EXAMPLES = [
	["/fulcrum/dashboard — Project Manager (dashboard)", "obsidian://fulcrum?screen=dashboard"],
	["/fulcrum/tasks", "obsidian://fulcrum?screen=tasks"],
	["/fulcrum/kanban", "obsidian://fulcrum?screen=kanban"],
	["/fulcrum/calendar", "obsidian://fulcrum?screen=calendar"],
	["/fulcrum/time — Time tracked", "obsidian://fulcrum?screen=time"],
	["/fulcrum/quick-start — Quick Start sidebar", "obsidian://fulcrum?screen=quick_start"],
	["/fulcrum/activity — Active timers sidebar", "obsidian://fulcrum?screen=activity"],
	[
		"/fulcrum/timeline — optional focalDate=YYYY-MM-DD",
		"obsidian://fulcrum?screen=timeline&focalDate=2026-04-01",
	],
	[
		"/fulcrum/project — requires projectPath",
		"obsidian://fulcrum?screen=project&projectPath=Projects%2FExample.md",
	],
	["/fulcrum/classic — standalone dashboard leaf", "obsidian://fulcrum?screen=classic"],
	["Alternate: route=/fulcrum/dashboard", "obsidian://fulcrum?route=%2Ffulcrum%2Fdashboard"],
	[
		"Open task note (Conduit Reminder link)",
		"obsidian://fulcrum?action=open_task&path=35%20Tasks%2FTaskNotes%2FExample.md",
	],
] as const;

function renderReferenceSection(containerEl: HTMLElement): void {
	metadataGroup(containerEl, "Reference — URI schemes & install", (body) => {
		body.createEl("p", {
			text: "Open Fulcrum from bookmarks or automation. The URI host must be the plugin id (fulcrum), not \"open\". Example: obsidian://fulcrum?screen=dashboard — query params carry screen, route, projectPath, focalDate. With multiple vaults open, the focused vault is used unless you launch via obsidian://open?vault=VAULT_NAME&…",
			cls: "fulcrum-settings-lead",
		});
		for (const [label, uri] of FULCRUM_URI_EXAMPLES) {
			body.createEl("p", {text: label, cls: "fulcrum-settings-lead"});
			const pre = body.createEl("pre", {cls: "fulcrum-settings-uri", text: uri});
			pre.style.whiteSpace = "pre-wrap";
			pre.style.wordBreak = "break-all";
		}
		body.createEl("p", {
			cls: "fulcrum-settings-lead",
			text: "Install into a vault: add a repo-root file fulcrum-vault.path with your vault path (see fulcrum-vault.path.example), then npm run build:install — or pass the path after -- : npm run build:install -- \"/path/to/Vault\"",
		});
	});
}

export function renderIntegrationsTab(ctx: SettingsContext): void {
	const {containerEl, plugin, refresh} = ctx;

	settingsLead(
		containerEl,
		"External services: TaskNotes HTTP API, macOS Calendar bridge, Apple Reminders, and OmniFocus.",
	);

	heading(containerEl, "TaskNotes HTTP API");
	new Setting(containerEl)
		.setName("Enable TaskNotes API")
		.setDesc(
			"Desktop only. When enabled, Fulcrum can call TaskNotes' local server (e.g. toggle-status). Enable the API in TaskNotes → Integrations. Docs: https://tasknotes.dev/HTTP_API/",
		)
		.addToggle((t) =>
			t.setValue(plugin.settings.taskNotesHttpApiEnabled).onChange(async (v) => {
				plugin.settings.taskNotesHttpApiEnabled = v;
				await plugin.saveSettings();
			}),
		);
	textSetting(ctx, "taskNotesHttpApiBaseUrl", "TaskNotes API base URL", undefined, {rebuild: false});
	const tokenRow = new Setting(containerEl).setName("TaskNotes API token (optional)");
	tokenRow.addText((tx) => {
		tx.inputEl.type = "password";
		tx.setPlaceholder("Bearer token if set in TaskNotes").setValue(
			plugin.settings.taskNotesHttpApiToken,
		);
		tx.onChange(async (v) => {
			plugin.settings.taskNotesHttpApiToken = v;
			await plugin.saveSettings();
		});
	});
	tokenRow.addButton((b) =>
		b.setButtonText("Test connection").onClick(async () => {
			b.setDisabled(true);
			const ac = new AbortController();
			const to = window.setTimeout(() => ac.abort(), 10_000);
			try {
				const r = await getTaskNotesHealth(
					plugin.settings.taskNotesHttpApiBaseUrl,
					plugin.settings.taskNotesHttpApiToken || undefined,
					ac.signal,
				);
				new Notice(r.ok ? "TaskNotes API reachable." : (r.error ?? "TaskNotes API check failed."));
			} finally {
				window.clearTimeout(to);
				b.setDisabled(false);
			}
		}),
	);

	renderCalendarIntegrationSection(ctx, plugin, refresh);

	displayConduitSettings(containerEl, plugin, refresh);
	displayOmniFocusSettings(containerEl, plugin, refresh);
	renderReferenceSection(containerEl);
}
