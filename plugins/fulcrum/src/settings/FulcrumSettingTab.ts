import {App, PluginSettingTab} from "obsidian";
import type FulcrumPlugin from "../main";
import type {SettingsContext, SettingsTabId, SettingsTabRender} from "./settingsContext";
import {renderIndexingTab} from "./tabs/indexing";
import {renderIntegrationsTab} from "./tabs/integrations";
import {renderMetadataTab} from "./tabs/metadata";
import {renderProjectsTab} from "./tabs/projects";
import {renderQuickNotesTab} from "./tabs/quickNotes";
import {renderTasksTab} from "./tabs/tasks";
import {renderTimerTab} from "./tabs/timer";
import {renderOrbitTab} from "./tabs/orbit";
import {renderViewsTab} from "./tabs/views";

const TAB_DEFS: {id: SettingsTabId; label: string; render: SettingsTabRender}[] = [
	{id: "indexing", label: "Indexing", render: renderIndexingTab},
	{id: "metadata", label: "Metadata", render: renderMetadataTab},
	{id: "tasks", label: "Tasks", render: renderTasksTab},
	{id: "projects", label: "Projects", render: renderProjectsTab},
	{id: "quickNotes", label: "Quick Notes", render: renderQuickNotesTab},
	{id: "views", label: "Views", render: renderViewsTab},
	{id: "timer", label: "Timer", render: renderTimerTab},
	{id: "orbit", label: "Orbit", render: renderOrbitTab},
	{id: "integrations", label: "Integrations", render: renderIntegrationsTab},
];

export class FulcrumSettingTab extends PluginSettingTab {
	plugin: FulcrumPlugin;
	private activeTab: SettingsTabId = "indexing";
	private panelEl: HTMLElement | null = null;
	private tabButtons = new Map<SettingsTabId, HTMLButtonElement>();

	constructor(app: App, plugin: FulcrumPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.addClass("fulcrum-settings-root");

		containerEl.createEl("p", {
			text: "Fulcrum indexes areas, projects, task notes, and meetings from your vault using configurable folders and frontmatter keys.",
			cls: "fulcrum-settings-lead",
		});

		const navEl = containerEl.createDiv({cls: "fulcrum-settings-tabs"});
		navEl.setAttribute("role", "tablist");
		navEl.setAttribute("aria-label", "Fulcrum settings sections");

		this.tabButtons.clear();
		for (const tab of TAB_DEFS) {
			const btn = navEl.createEl("button", {
				cls: "fulcrum-settings-tab",
				text: tab.label,
				type: "button",
			});
			btn.setAttribute("role", "tab");
			btn.setAttribute("aria-selected", tab.id === this.activeTab ? "true" : "false");
			btn.toggleClass("is-active", tab.id === this.activeTab);
			btn.addEventListener("click", () => {
				if (this.activeTab === tab.id) return;
				this.activeTab = tab.id;
				this.renderActiveTab();
			});
			this.tabButtons.set(tab.id, btn);
		}

		this.panelEl = containerEl.createDiv({cls: "fulcrum-settings-panel"});
		this.panelEl.setAttribute("role", "tabpanel");
		this.renderActiveTab();
	}

	private renderActiveTab(): void {
		if (!this.panelEl) return;
		this.panelEl.empty();

		for (const [id, btn] of this.tabButtons) {
			const active = id === this.activeTab;
			btn.toggleClass("is-active", active);
			btn.setAttribute("aria-selected", active ? "true" : "false");
		}

		const def = TAB_DEFS.find((t) => t.id === this.activeTab);
		if (!def || !this.panelEl) return;

		const ctx: SettingsContext = {
			plugin: this.plugin,
			containerEl: this.panelEl,
			refresh: () => this.renderActiveTab(),
		};
		def.render(ctx);
	}
}
