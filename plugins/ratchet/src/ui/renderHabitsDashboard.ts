import { setIcon } from "obsidian";
import type RatchetPlugin from "../main";
import type { DataManager } from "../data/DataManager";
import type { TrackerConfig } from "../data/TrackerConfig";
import { RESET_PERIOD_LABELS, hasGoal, isCheckOffHabit, isGoalMet, isCheckOffPeriodMet, checkOffGoalTarget } from "../data/TrackerConfig";
import { checkOffPeriodPercent } from "./checkOffDay";
import { goalStatusForDayFromDetail, emptyDayDetail } from "./gridMonthModel";
import { habitDayStatus } from "./habitDayStatus";
import { toggleCheckOffDay } from "./checkOffDay";
import { computeWeekCompletePercent } from "./trackerWeekProgress";
import { createHabitHeatmapElement, HABIT_HEATMAP_MINI_DAYS } from "./habitHeatmapBuilder";

export interface HabitsDashboardOptions {
	onRefresh: () => void;
	openHabit: (id: string) => void;
	openNewTracker: () => void;
}

interface TrackerDashboardData {
	tracker: TrackerConfig;
	currentCount: number;
	periodMet: boolean;
	streak: number;
	weekComplete: number;
}

export async function renderHabitsDashboard(
	mount: HTMLElement,
	plugin: RatchetPlugin,
	options: HabitsDashboardOptions,
): Promise<void> {
	mount.empty();
	const dm = plugin.getDataManager();
	const trackers = (await dm.getActiveTrackers()).slice().sort((a, b) => a.name.localeCompare(b.name));

	const root = mount.createDiv({ cls: "ratchet-hdash" });
	const head = root.createDiv({ cls: "ratchet-hdash__head" });
	head.createEl("h1", { cls: "ratchet-hdash__title", text: "Dashboard" });

	const cards: TrackerDashboardData[] = [];
	for (const tracker of trackers) {
		cards.push(await loadTrackerDashboardData(dm, tracker));
	}

	const todayMet = cards.filter((c) => c.periodMet).length;
	const summary = head.createDiv({ cls: "ratchet-hdash__summary" });
	appendSummaryStat(summary, "Today", `${todayMet}/${trackers.length}`, "habits on track");
	if (trackers.length > 0) {
		const avgWeek = Math.round(cards.reduce((s, c) => s + c.weekComplete, 0) / cards.length);
		appendSummaryStat(summary, "This week", `${avgWeek}%`, "avg completion");
		const bestStreak = Math.max(0, ...cards.map((c) => c.streak));
		appendSummaryStat(summary, "Best streak", String(bestStreak), "days");
	}

	const grid = root.createDiv({ cls: "ratchet-hdash__grid" });

	if (trackers.length === 0) {
		const empty = grid.createDiv({ cls: "ratchet-hdash__empty" });
		empty.createEl("p", { text: "No habits yet. Create one to start tracking." });
		const btn = empty.createEl("button", { cls: "mod-cta", type: "button", text: "New habit" });
		btn.addEventListener("click", () => options.openNewTracker());
		return;
	}

	for (const data of cards) {
		await appendHabitCard(grid, plugin, data, options);
	}
}

function appendSummaryStat(parent: HTMLElement, label: string, value: string, sub: string): void {
	const el = parent.createDiv({ cls: "ratchet-hdash__stat" });
	el.createSpan({ cls: "ratchet-hdash__stat-label", text: label });
	el.createSpan({ cls: "ratchet-hdash__stat-value", text: value });
	el.createSpan({ cls: "ratchet-hdash__stat-sub", text: sub });
}

async function loadTrackerDashboardData(
	dm: DataManager,
	tracker: TrackerConfig,
): Promise<TrackerDashboardData> {
	const currentCount = await dm.getCurrentCount(tracker.id);
	const todayStatus = await dm.getGoalStatusForDay(tracker.id, new Date());
	const periodMet = isCheckOffHabit(tracker)
		? tracker.resetPeriod === "daily"
			? todayStatus === "met"
			: isCheckOffPeriodMet(tracker, currentCount)
		: hasGoal(tracker)
			? isGoalMet(tracker, currentCount)
			: currentCount > 0;

	const today = new Date();
	const weekStart = new Date(today);
	weekStart.setDate(weekStart.getDate() - 6);
	weekStart.setHours(0, 0, 0, 0);
	const streakStart = new Date(today);
	streakStart.setDate(streakStart.getDate() - 364);
	streakStart.setHours(0, 0, 0, 0);
	const streakEntries = await dm.getDayEntries(tracker.id, streakStart, today);

	const weekComplete = await computeWeekCompletePercent(dm, tracker, today);

	const streak = computeStreakFromEntries(tracker, streakEntries, today);

	return { tracker, currentCount, periodMet, streak, weekComplete };
}

function computeStreakFromEntries(
	tracker: TrackerConfig,
	entries: { dateKey: string; date: Date; count: number; eventCount: number; hasDoneMarker: boolean }[],
	today: Date,
): number {
	const byKey = new Map(entries.map((e) => [e.dateKey, e]));
	let streak = 0;
	for (let i = 0; i < 365; i++) {
		const d = new Date(today);
		d.setDate(d.getDate() - i);
		const key = dateKeyLocal(d);
		const row = byKey.get(key);
		if (isCheckOffHabit(tracker)) {
			const detail = row
				? { count: row.count, eventCount: row.eventCount, hasDoneMarker: row.hasDoneMarker }
				: emptyDayDetail();
			if (goalStatusForDayFromDetail(tracker, detail) === "met") {
				streak++;
				continue;
			}
			if (i === 0) continue;
			break;
		}
		if (!row || row.eventCount === 0) {
			if (i === 0) continue;
			break;
		}
		const status = habitDayStatus(tracker, row.count, row.eventCount, row.hasDoneMarker);
		if (status === "complete" || (tracker.goalType === "none" && row.count > 0)) {
			streak++;
		} else if (i === 0) {
			continue;
		} else {
			break;
		}
	}
	return streak;
}

function dateKeyLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

async function appendHabitCard(
	grid: HTMLElement,
	plugin: RatchetPlugin,
	data: TrackerDashboardData,
	options: HabitsDashboardOptions,
): Promise<void> {
	const { tracker, currentCount, periodMet, streak, weekComplete } = data;
	const accent = tracker.color || "var(--interactive-accent)";

	const card = grid.createDiv({ cls: "ratchet-hdash-card" });
	card.style.setProperty("--ratchet-hdash-accent", accent);

	const top = card.createDiv({ cls: "ratchet-hdash-card__top" });
	const identity = top.createDiv({ cls: "ratchet-hdash-card__identity" });
	identity.createSpan({ cls: "ratchet-hdash-card__icon", text: tracker.icon || "📌" });
	const textCol = identity.createDiv({ cls: "ratchet-hdash-card__text" });
	textCol.createDiv({ cls: "ratchet-hdash-card__name", text: tracker.name });
	const metaParts = [RESET_PERIOD_LABELS[tracker.resetPeriod]];
	if (streak > 0) metaParts.push(`${streak}d streak`);
	textCol.createDiv({ cls: "ratchet-hdash-card__meta", text: metaParts.join(" · ") });

	const ringWrap = top.createDiv({ cls: "ratchet-hdash-card__ring-wrap" });
	const pct = isCheckOffHabit(tracker)
		? tracker.resetPeriod === "daily"
			? weekComplete
			: checkOffPeriodPercent(tracker, currentCount)
		: progressPercent(tracker, currentCount);
	const ring = ringWrap.createDiv({
		cls: `ratchet-hdash-card__ring ${periodMet ? "ratchet-hdash-card__ring--met" : ""}`,
	});
	ring.style.setProperty("--ratchet-hdash-ring-pct", String(pct));
	ringWrap.createSpan({
		cls: "ratchet-hdash-card__ring-label",
		text: formatCountLabel(tracker, currentCount, periodMet),
	});

	const heatWrap = card.createDiv({ cls: "ratchet-hdash-card__heatmap" });
	const heatmap = await createHabitHeatmapElement(plugin, tracker, HABIT_HEATMAP_MINI_DAYS, {
		ariaLabel: `${tracker.name} last 12 weeks`,
	});
	heatmap.addClass("ratchet-hdash-card__heatmap-inner");
	heatWrap.appendChild(heatmap);

	const foot = card.createDiv({ cls: "ratchet-hdash-card__foot" });
	foot.createSpan({ cls: "ratchet-hdash-card__week", text: `${weekComplete}% this week` });

	const logBtn = foot.createEl("button", {
		type: "button",
		cls: "ratchet-hdash-card__log-btn",
		attr: { "aria-label": `Log ${tracker.name}` },
	});
	setIcon(logBtn, "plus");
	logBtn.addEventListener("click", (ev) => {
		ev.stopPropagation();
		void (async () => {
			const dm = plugin.getDataManager();
			if (isCheckOffHabit(tracker)) {
				const today = new Date();
				const entries = await dm.getDayEntries(tracker.id, today, today);
				const row = entries[0];
				const detail = row
					? { count: row.count, eventCount: row.eventCount, hasDoneMarker: row.hasDoneMarker }
					: emptyDayDetail();
				await toggleCheckOffDay(dm, tracker.id, today, detail);
			} else {
				await dm.increment(tracker.id, 1);
			}
			options.onRefresh();
		})();
	});

	const openDetail = (): void => options.openHabit(tracker.id);
	card.addEventListener("click", openDetail);
	card.addEventListener("keydown", (ev) => {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		openDetail();
	});
	card.setAttribute("role", "button");
	card.tabIndex = 0;
}

function progressPercent(tracker: TrackerConfig, count: number): number {
	if (isCheckOffHabit(tracker)) return 0;
	if (!hasGoal(tracker)) return count > 0 ? 100 : 0;
	if (tracker.goalType === "at least") {
		return Math.min(100, Math.round((count / Math.max(tracker.goal, 1)) * 100));
	}
	return Math.min(100, Math.round((1 - Math.min(count, tracker.goal) / tracker.goal) * 100));
}

function formatCountLabel(tracker: TrackerConfig, count: number, periodMet = false): string {
	if (isCheckOffHabit(tracker)) {
		if (tracker.resetPeriod === "daily") return periodMet ? "Done" : "—";
		const g = checkOffGoalTarget(tracker);
		return `${count}/${g}`;
	}
	if (!hasGoal(tracker)) return String(count);
	const unit = tracker.unit?.trim() ? ` ${tracker.unit.trim()}` : "";
	return `${count}/${tracker.goal}${unit}`;
}
