import type RatchetPlugin from "../main";
import type { TrackerConfig } from "../data/TrackerConfig";
import { RESET_PERIOD_LABELS } from "../data/TrackerConfig";
import { computeWeekCompletePercent, formatWeekCompleteSubtitle } from "./trackerWeekProgress";

export interface TrackerSidebarListOptions {
	selectedId: string | null;
	mainPane: "overview" | "dashboard" | "grid" | "habit";
	onSelectTracker: (id: string) => void;
	weekCompleteById?: ReadonlyMap<string, number>;
}

function renderTrackerRows(
	list: HTMLElement,
	trackers: TrackerConfig[],
	options: TrackerSidebarListOptions,
	archivedSection: boolean,
): void {
	for (const tracker of trackers) {
		const li = list.createEl("li");
		const isActive = options.mainPane === "habit" && options.selectedId === tracker.id;
		const row = li.createDiv({
			cls: `ratchet-pl-row ${isActive ? "ratchet-pl-row--active" : ""}${archivedSection ? " ratchet-pl-row--archived" : ""}`,
			attr: {
				role: "button",
				tabindex: "0",
				"aria-label": tracker.name,
			},
		});
		row.style.setProperty("--ratchet-pl-accent", tracker.color || "var(--background-modifier-border)");

		const inner = row.createDiv({ cls: "ratchet-pl-row__inner" });
		const head = inner.createDiv({ cls: "ratchet-pl-row__head" });
		head.createSpan({
			cls: "ratchet-pl-row__name",
			text: `${tracker.icon || "📌"} ${tracker.name}`,
		});
		head.createSpan({
			cls: "ratchet-pl-row__meta-part",
			text: RESET_PERIOD_LABELS[tracker.resetPeriod] ?? tracker.resetPeriod,
		});

		if (!archivedSection) {
			const weekPct = options.weekCompleteById?.get(tracker.id);
			if (weekPct != null) {
				inner.createEl("p", {
					cls: "ratchet-pl-row__desc",
					text: formatWeekCompleteSubtitle(weekPct),
				});
			}
		} else {
			inner.createEl("p", {
				cls: "ratchet-pl-row__desc ratchet-pl-row__desc--muted",
				text: "Archived",
			});
		}

		const activate = (): void => options.onSelectTracker(tracker.id);
		row.addEventListener("click", activate);
		row.addEventListener("keydown", (ev) => {
			if (ev.key !== "Enter" && ev.key !== " ") return;
			ev.preventDefault();
			activate();
		});
	}
}

export function renderTrackerSidebarList(
	mount: HTMLElement,
	activeTrackers: TrackerConfig[],
	archivedTrackers: TrackerConfig[],
	options: TrackerSidebarListOptions,
): void {
	mount.empty();

	if (activeTrackers.length === 0 && archivedTrackers.length === 0) {
		mount.createDiv({
			cls: "ratchet-pm__sidebar-empty",
			text: "No trackers yet. Use + to create one.",
		});
		return;
	}

	if (activeTrackers.length > 0) {
		const list = mount.createEl("ul", { cls: "ratchet-sidebar-tracker-list" });
		renderTrackerRows(list, activeTrackers, options, false);
	}

	if (archivedTrackers.length > 0) {
		mount.createEl("div", {
			cls: "ratchet-sidebar-archived-label",
			text: "Archived",
		});
		const archivedList = mount.createEl("ul", { cls: "ratchet-sidebar-tracker-list ratchet-sidebar-tracker-list--archived" });
		renderTrackerRows(archivedList, archivedTrackers, options, true);
	}
}

export async function loadAndRenderTrackerSidebarList(
	mount: HTMLElement,
	plugin: RatchetPlugin,
	options: TrackerSidebarListOptions,
): Promise<void> {
	const dm = plugin.getDataManager();
	const sortByName = (a: TrackerConfig, b: TrackerConfig) => a.name.localeCompare(b.name);
	const activeTrackers = (await dm.getActiveTrackers()).slice().sort(sortByName);
	const archivedTrackers = (await dm.getArchivedTrackers()).slice().sort(sortByName);
	const weekCompleteById = new Map<string, number>();
	await Promise.all(
		activeTrackers.map(async (t) => {
			weekCompleteById.set(t.id, await computeWeekCompletePercent(dm, t));
		}),
	);
	renderTrackerSidebarList(mount, activeTrackers, archivedTrackers, { ...options, weekCompleteById });
}
