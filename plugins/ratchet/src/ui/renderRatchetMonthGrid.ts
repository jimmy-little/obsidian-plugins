import { Menu, setIcon } from "obsidian";
import type RatchetPlugin from "../main";
import type { RatchetEvent } from "../data/EventLog";
import { RESET_PERIOD_LABELS } from "../data/TrackerConfig";
import {
	aggregateDayPercent,
	computeWeekStatColumn,
	detailByDayIndexFromEvents,
	dowInitialForDate,
	emptyDayDetail,
	formatWeekTitle,
	goalStatusForDayFromDetail,
	overallWeekPercent,
	resolveGridWeekStart,
	weekDateKey,
	weekDates,
	type DayDetail,
} from "./gridMonthModel";
import { toggleCheckOffDay, checkOffDayDone } from "./checkOffDay";
import { isCheckOffHabit, formatCheckOffGoalSummary } from "../data/TrackerConfig";

const DAY_COLS = 7;

/**
 * Mount the week grid into `mount` (replaces children). Reads week from `plugin.ratchetViewState.gridWeekStartKey`.
 */
export async function renderRatchetMonthGrid(mount: HTMLElement, plugin: RatchetPlugin, rerender: () => void): Promise<void> {
	mount.empty();
	const dm = plugin.getDataManager();
	const firstDow = plugin.settings.firstDayOfWeek;
	const st = plugin.ratchetViewState;

	const weekStart = resolveGridWeekStart(st.gridWeekStartKey, firstDow);
	st.gridWeekStartKey = weekDateKey(weekStart);

	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999);

	const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
	const monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0, 23, 59, 59, 999);

	const trackers = (await dm.getActiveTrackers()).slice().sort((a, b) => a.name.localeCompare(b.name));
	const days = weekDates(weekStart);

	const details = new Map<string, Map<number, DayDetail>>();
	const eventsWeekByTracker = new Map<string, RatchetEvent[]>();
	const eventsMonthByTracker = new Map<string, RatchetEvent[]>();
	const eventsYearByTracker = new Map<string, RatchetEvent[]>();

	for (const t of trackers) {
		const evW = await dm.getHistory(t.id, weekStart, weekEnd);
		eventsWeekByTracker.set(t.id, evW);
		details.set(t.id, detailByDayIndexFromEvents(evW, weekStart));

		if (t.resetPeriod === "monthly" || t.resetPeriod === "daily") {
			eventsMonthByTracker.set(t.id, await dm.getHistory(t.id, monthStart, monthEnd));
		}
		if (t.resetPeriod === "yearly") {
			const yStart = new Date(weekStart.getFullYear(), 0, 1);
			const yEnd = new Date(weekStart.getFullYear(), 11, 31, 23, 59, 59, 999);
			eventsYearByTracker.set(t.id, await dm.getHistory(t.id, yStart, yEnd));
			eventsMonthByTracker.set(t.id, await dm.getHistory(t.id, monthStart, monthEnd));
		}
	}

	const overall = overallWeekPercent(trackers, details);

	const root = mount.createDiv({ cls: "ratchet-grid-view ratchet-grid-view--week" });

	function shiftWeek(delta: number): void {
		const ws = new Date(weekStart);
		ws.setDate(ws.getDate() + delta * 7);
		st.gridWeekStartKey = weekDateKey(ws);
		rerender();
	}

	const head = root.createDiv({ cls: "ratchet-grid-header" });
	const titleRow = head.createDiv({ cls: "ratchet-grid-title-row" });
	const prevBtn = titleRow.createEl("button", {
		type: "button",
		cls: "ratchet-grid-nav-btn clickable-icon",
		attr: { "aria-label": "Previous week" },
	});
	setIcon(prevBtn, "chevron-left");
	prevBtn.addEventListener("click", () => shiftWeek(-1));

	titleRow.createEl("h1", {
		cls: "ratchet-grid-title",
		text: formatWeekTitle(weekStart),
	});

	const nextBtn = titleRow.createEl("button", {
		type: "button",
		cls: "ratchet-grid-nav-btn clickable-icon",
		attr: { "aria-label": "Next week" },
	});
	setIcon(nextBtn, "chevron-right");
	nextBtn.addEventListener("click", () => shiftWeek(1));

	const scroll = root.createDiv({ cls: "ratchet-grid-scroll" });
	const table = scroll.createEl("table", { cls: "ratchet-grid-table ratchet-grid-table--week" });
	const thead = table.createEl("thead");

	const trBars = thead.createEl("tr", { cls: "ratchet-grid-tr-bars" });
	trBars.createEl("th", {
		cls: "ratchet-grid-th-habit ratchet-grid-th-daily-label",
		text: "Daily habits",
	});
	for (let i = 0; i < DAY_COLS; i++) {
		const pct = Math.min(100, aggregateDayPercent(trackers, details, i));
		const thBar = trBars.createEl("th", { cls: "ratchet-grid-th-vbar" });
		const track = thBar.createDiv({ cls: "ratchet-grid-vbar-track" });
		const inner = track.createDiv({ cls: "ratchet-grid-vbar-inner" });
		const fill = inner.createDiv({ cls: "ratchet-grid-vbar-fill" });
		fill.style.height = `${pct}%`;
		thBar.createDiv({ cls: "ratchet-grid-vbar-pct", text: `${pct.toFixed(1)}%` });
	}
	trBars.createEl("th", { cls: "ratchet-grid-th-stat ratchet-grid-th-stat--bars" });
	trBars.createEl("th", { cls: "ratchet-grid-th-stat ratchet-grid-th-stat--bars" });
	trBars.createEl("th", { cls: "ratchet-grid-th-stat ratchet-grid-th-stat--bars" });

	const trDow = thead.createEl("tr", { cls: "ratchet-grid-tr-dow" });
	trDow.createEl("th", { cls: "ratchet-grid-th-habit", text: "Habits" });
	for (const d of days) {
		trDow.createEl("th", { cls: "ratchet-grid-th-day", text: dowInitialForDate(d) });
	}
	trDow.createEl("th", { cls: "ratchet-grid-th-stat", text: "Goal" });
	trDow.createEl("th", { cls: "ratchet-grid-th-stat", text: "%" });
	trDow.createEl("th", { cls: "ratchet-grid-th-stat", text: "Count" });

	const trNum = thead.createEl("tr", { cls: "ratchet-grid-tr-num" });
	trNum.createEl("th");
	for (const d of days) {
		trNum.createEl("th", { cls: "ratchet-grid-th-num", text: String(d.getDate()) });
	}
	trNum.createEl("th");
	trNum.createEl("th");
	trNum.createEl("th");

	const tbody = table.createEl("tbody");

	for (const tracker of trackers) {
		const evW = eventsWeekByTracker.get(tracker.id) ?? [];
		const evM = eventsMonthByTracker.get(tracker.id) ?? evW;
		const evY = tracker.resetPeriod === "yearly" ? eventsYearByTracker.get(tracker.id) ?? evM : null;
		const det = details.get(tracker.id) ?? new Map();
		const stat = computeWeekStatColumn(tracker, evW, evM, evY, det, weekStart, firstDow);

		const tr = tbody.createEl("tr");
		const habitTh = tr.createEl("th", {
			cls: "ratchet-grid-habit-name",
			attr: { scope: "row" },
		});
		habitTh.createSpan({ cls: "ratchet-grid-habit-icon", text: tracker.icon || "📌" });
		habitTh.createSpan({ text: tracker.name });

		for (let i = 0; i < DAY_COLS; i++) {
			const cellDate = days[i]!;
			const row = det.get(i) ?? emptyDayDetail();
			const stCell = goalStatusForDayFromDetail(tracker, row);
			const met = stCell === "met";
			const checkOff = isCheckOffHabit(tracker);
			const td = tr.createEl("td", { cls: "ratchet-grid-cell" });
			const btn = td.createEl("button", {
				type: "button",
				cls: `ratchet-grid-cell-btn${checkOff ? " ratchet-grid-cell-btn--check" : ""}`,
				attr: { "aria-label": `${tracker.name} ${cellDate.toLocaleDateString()}` },
			});
			if (met) {
				btn.addClass("ratchet-grid-cell-btn--met");
				btn.style.setProperty("--ratchet-cell-accent", tracker.color || "#7c3aed");
			}
			if (checkOff) {
				btn.createSpan({
					cls: `ratchet-grid-cell-check${checkOffDayDone(row) ? " ratchet-grid-cell-check--on" : ""}`,
					text: checkOffDayDone(row) ? "✓" : "—",
				});
			} else {
				btn.createSpan({
					cls: `ratchet-grid-cell-num${row.count === 0 ? " ratchet-grid-cell-num--zero" : ""}`,
					text: String(row.count),
				});
			}

			btn.addEventListener("click", async (ev) => {
				ev.preventDefault();
				const trk = await dm.getTracker(tracker.id);
				if (!trk) return;
				if (isCheckOffHabit(trk)) {
					await toggleCheckOffDay(dm, tracker.id, cellDate, row);
				} else {
					await dm.incrementOnDate(tracker.id, 1, cellDate);
				}
				rerender();
			});

			btn.addEventListener("contextmenu", (ev) => {
				ev.preventDefault();
				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Reset day");
					item.setIcon("rotate-ccw");
					item.onClick(() => {
						void dm.clearEventsForTrackerOnDay(tracker.id, cellDate).then(() => rerender());
					});
				});
				menu.showAtMouseEvent(ev);
			});
		}

		tr.createEl("td", { cls: "ratchet-grid-stat", text: stat.goalLabel });
		const pctTd = tr.createEl("td", { cls: "ratchet-grid-stat ratchet-grid-stat--pct" });
		pctTd.createSpan({ text: `${stat.percent}%` });
		const bar = pctTd.createDiv({ cls: "ratchet-grid-stat-bar" });
		const barFill = bar.createDiv({ cls: "ratchet-grid-stat-bar-fill" });
		barFill.style.width = `${Math.min(100, stat.percent)}%`;
		tr.createEl("td", { cls: "ratchet-grid-stat", text: stat.countLabel });
	}

	if (trackers.length === 0) {
		const tr = tbody.createEl("tr");
		const td = tr.createEl("td", { attr: { colspan: String(DAY_COLS + 4) } });
		td.createSpan({
			cls: "ratchet-grid-muted",
			text: "Create trackers from the dashboard to fill this grid.",
		});
	}

	const footer = root.createDiv({ cls: "ratchet-grid-footer" });
	const goalsBelow = footer.createDiv({ cls: "ratchet-grid-goals ratchet-grid-goals--below" });
	goalsBelow.createEl("div", { cls: "ratchet-grid-goals-title", text: "Goals" });
	const goalsBody = goalsBelow.createDiv({ cls: "ratchet-grid-goals-body" });
	if (trackers.length === 0) {
		goalsBody.createSpan({ cls: "ratchet-grid-muted", text: "No trackers yet." });
	} else {
		for (const t of trackers) {
			const line = goalsBody.createDiv({ cls: "ratchet-grid-goal-line" });
			line.createSpan({ cls: "ratchet-grid-goal-name", text: t.name });
			if (isCheckOffHabit(t)) {
				line.createSpan({ cls: "ratchet-grid-goal-meta", text: ` · ${formatCheckOffGoalSummary(t)}` });
			} else if (t.goalType !== "none") {
				const pl = RESET_PERIOD_LABELS[t.resetPeriod];
				line.createSpan({
					cls: "ratchet-grid-goal-meta",
					text: ` · ${pl} ${t.goalType === "at least" ? "≥" : "≤"} ${t.goal}${t.unit ? ` ${t.unit}` : ""}`,
				});
			}
		}
	}

	const progPanel = footer.createDiv({ cls: "ratchet-grid-progress-panel" });
	progPanel.createEl("div", { cls: "ratchet-grid-section-label", text: "Progress" });
	const donutWrap = progPanel.createDiv({ cls: "ratchet-grid-donut-wrap" });
	const donut = donutWrap.createDiv({ cls: "ratchet-grid-donut" });
	donut.style.setProperty("--ratchet-donut-pct", String(Math.min(100, overall)));
	donutWrap.createDiv({ cls: "ratchet-grid-donut-label", text: `${overall.toFixed(1)}%` });
}
