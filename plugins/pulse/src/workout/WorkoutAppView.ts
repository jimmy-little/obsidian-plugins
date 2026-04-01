import { Platform, setIcon } from "obsidian";
import type PulsePlugin from "../main";
import { TodayTab, type TodayTabOptions } from "./TodayTab";
import { HistoryTab } from "./HistoryTab";
import { ExercisesTab } from "./ExercisesTab";
import { StatsTab } from "./StatsTab";

interface Tab {
	id: string;
	icon: string;
	label: string;
	render: (container: HTMLElement) => void;
	destroy?: () => void;
}

export class WorkoutAppView {
	private container: HTMLElement;
	private plugin: PulsePlugin;
	private options: TodayTabOptions;
	private tabContentEl: HTMLElement | null = null;
	private activeTabId: string = "today";
	private tabs: Tab[] = [];
	private todayTab: TodayTab | null = null;
	private historyTab: HistoryTab | null = null;
	private exercisesTab: ExercisesTab | null = null;
	private statsTab: StatsTab | null = null;

	constructor(container: HTMLElement, plugin: PulsePlugin, options: TodayTabOptions) {
		this.container = container;
		this.plugin = plugin;
		this.options = options;
	}

	render(): void {
		this.container.empty();
		this.container.addClass("pulse-workout-app");

		this.todayTab = new TodayTab(this.plugin, this.options);
		this.historyTab = new HistoryTab(this.plugin);
		this.exercisesTab = new ExercisesTab(this.plugin);
		this.statsTab = new StatsTab(this.plugin);

		this.tabs = [
			{
				id: "today",
				icon: "dumbbell",
				label: "Today",
				render: (el) => this.todayTab!.render(el),
				destroy: () => this.todayTab?.destroy(),
			},
			{
				id: "history",
				icon: "history",
				label: "History",
				render: (el) => this.historyTab!.render(el),
				destroy: () => this.historyTab?.destroy(),
			},
			{
				id: "exercises",
				icon: "list",
				label: "Exercises",
				render: (el) => this.exercisesTab!.render(el),
				destroy: () => this.exercisesTab?.destroy(),
			},
			{
				id: "stats",
				icon: "bar-chart-2",
				label: "Stats",
				render: (el) => this.statsTab!.render(el),
				destroy: () => this.statsTab?.destroy(),
			},
		];

		const isMobile = Platform.isMobile;

		if (!isMobile) {
			this.renderTabBar(this.container);
		}

		this.tabContentEl = this.container.createDiv({ cls: "pulse-workout-content" });

		if (isMobile) {
			this.renderTabBar(this.container);
		}

		this.switchTab(this.activeTabId);
	}

	private renderTabBar(parent: HTMLElement): void {
		const tabBar = parent.createDiv({ cls: "pulse-workout-tab-bar" });

		for (const tab of this.tabs) {
			const tabBtn = tabBar.createDiv({
				cls: `pulse-workout-tab ${tab.id === this.activeTabId ? "pulse-workout-tab-active" : ""}`,
			});
			const iconSpan = tabBtn.createSpan({ cls: "pulse-workout-tab-icon" });
			setIcon(iconSpan, tab.icon);
			tabBtn.createSpan({ text: tab.label, cls: "pulse-workout-tab-label" });

			tabBtn.addEventListener("click", () => {
				this.switchTab(tab.id);
				tabBar.querySelectorAll(".pulse-workout-tab").forEach(el => el.removeClass("pulse-workout-tab-active"));
				tabBtn.addClass("pulse-workout-tab-active");
			});
		}
	}

	private switchTab(tabId: string): void {
		const currentTab = this.tabs.find(t => t.id === this.activeTabId);
		if (currentTab?.destroy && this.activeTabId !== tabId) {
			currentTab.destroy();
		}

		this.activeTabId = tabId;
		if (!this.tabContentEl) return;
		this.tabContentEl.empty();

		const tab = this.tabs.find(t => t.id === tabId);
		if (tab) {
			tab.render(this.tabContentEl);
		}
	}

	destroy(): void {
		this.todayTab?.destroy();
		this.historyTab?.destroy();
		this.exercisesTab?.destroy();
		this.statsTab?.destroy();
	}
}
