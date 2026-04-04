import { Menu, setIcon } from "obsidian";
import type RatchetPlugin from "../main";
import type { RatchetEvent } from "../data/EventLog";
import { RESET_PERIOD_LABELS } from "../data/TrackerConfig";
import {
	aggregateDayPercent,
	computeMonthStatColumn,
	daysInMonth,
	detailByDayFromEvents,
	dowInitial,
	monthWeekBand,
	monthWeekHistoryRange,
	overallMonthPercent,
	sumByDayFromEvents,
	goalStatusForDayFromDetail,
	type MonthStatColumn,
} from "./gridMonthModel";

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const WEEK_BAND_CLASS = [
	"ratchet-grid-wk--0",
	"ratchet-grid-wk--1",
	"ratchet-grid-wk--2",
	"ratchet-grid-wk--3",
	"ratchet-grid-wk--4",
];

/**
 * Mount the month grid into `mount` (replaces children). Reads year/month from `plugin.ratchetViewState`.
 */
export async function renderRatchetMonthGrid(mount: HTMLElement, plugin: RatchetPlugin, rerender: () => void): Promise<void> {
	mount.empty();
	const dm = plugin.getDataManager();
	const firstDow = plugin.settings.firstDayOfWeek;
	const st = plugin.ratchetViewState;
	const y = st.gridYear ?? new Date().getFullYear();
	const m = st.gridMonth ?? new Date().getMonth();
	st.gridYear = y;
	st.gridMonth = m;

	const trackers = (await dm.getAllTrackers()).slice().sort((a, b) => a.name.localeCompare(b.name));
	const dim = daysInMonth(y, m);

	const monthStart = new Date(y, m, 1);
	const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);

	const counts = new Map<string, Map<number, number>>();
	const details = new Map<string, Map<number, { count: number; eventCount: number }>>();
	const eventsMonthByTracker = new Map<string, RatchetEvent[]>();
	const eventsYearByTracker = new Map<string, RatchetEvent[]>();
	const eventsWeekByTracker = new Map<string, RatchetEvent[]>();
	const weekSpan = monthWeekHistoryRange(y, m, firstDow);

	for (const t of trackers) {
		const ev = await dm.getHistory(t.id, monthStart, monthEnd);
		eventsMonthByTracker.set(t.id, ev);
		counts.set(t.id, sumByDayFromEvents(ev, y, m));
		details.set(t.id, detailByDayFromEvents(ev, y, m));
		if (t.resetPeriod === "weekly") {
			eventsWeekByTracker.set(t.id, await dm.getHistory(t.id, weekSpan.start, weekSpan.end));
		}
		if (t.resetPeriod === "yearly") {
			const yStart = new Date(y, 0, 1);
			const yEnd = new Date(y, 11, 31, 23, 59, 59, 999);
			eventsYearByTracker.set(t.id, await dm.getHistory(t.id, yStart, yEnd));
		}
	}

	const overall = overallMonthPercent(trackers, counts, y, m);

	const root = mount.createDiv({ cls: "ratchet-grid-view" });

	function shiftMonth(delta: number): void {
		const d = new Date(y, m + delta, 1);
		st.gridYear = d.getFullYear();
		st.gridMonth = d.getMonth();
		rerender();
	}

	/* —— Header —— */
	const head = root.createDiv({ cls: "ratchet-grid-header" });
	const titleRow = head.createDiv({ cls: "ratchet-grid-title-row" });
	const prevBtn = titleRow.createEl("button", {
		type: "button",
		cls: "ratchet-grid-nav-btn clickable-icon",
		attr: { "aria-label": "Previous month" },
	});
	setIcon(prevBtn, "chevron-left");
	prevBtn.addEventListener("click", () => shiftMonth(-1));

	titleRow.createEl("h1", {
		cls: "ratchet-grid-title",
		text: `${MONTH_NAMES[m]} habit tracker`,
	});

	const nextBtn = titleRow.createEl("button", {
		type: "button",
		cls: "ratchet-grid-nav-btn clickable-icon",
		attr: { "aria-label": "Next month" },
	});
	setIcon(nextBtn, "chevron-right");
	nextBtn.addEventListener("click", () => shiftMonth(1));

	const headerBand = head.createDiv({ cls: "ratchet-grid-header-band" });
	headerBand.createDiv({ cls: "ratchet-grid-header-band-spacer" });
	const progPanel = headerBand.createDiv({ cls: "ratchet-grid-progress-panel" });
	progPanel.createEl("div", { cls: "ratchet-grid-section-label", text: "Progress" });
	const donutWrap = progPanel.createDiv({ cls: "ratchet-grid-donut-wrap" });
	const donut = donutWrap.createDiv({ cls: "ratchet-grid-donut" });
	donut.style.setProperty("--ratchet-donut-pct", String(Math.min(100, overall)));
	donutWrap.createDiv({ cls: "ratchet-grid-donut-label", text: `${overall.toFixed(1)}%` });

	const scroll = root.createDiv({ cls: "ratchet-grid-scroll" });
	const table = scroll.createEl("table", { cls: "ratchet-grid-table" });
	const thead = table.createEl("thead");

	const trBars = thead.createEl("tr", { cls: "ratchet-grid-tr-bars" });
	trBars.createEl("th", {
		cls: "ratchet-grid-th-habit ratchet-grid-th-daily-label",
		text: "Daily progress",
	});
	for (let d = 1; d <= dim; d++) {
		const pct = Math.min(100, aggregateDayPercent(trackers, counts, d));
		const thBar = trBars.createEl("th", {
			cls: `ratchet-grid-th-vbar ${WEEK_BAND_CLASS[monthWeekBand(d)] ?? ""}`,
		});
		const track = thBar.createDiv({ cls: "ratchet-grid-vbar-track" });
		const inner = track.createDiv({ cls: "ratchet-grid-vbar-inner" });
		const fill = inner.createDiv({ cls: "ratchet-grid-vbar-fill" });
		fill.style.height = `${pct}%`;
		thBar.createDiv({ cls: "ratchet-grid-vbar-pct", text: `${pct.toFixed(1)}%` });
	}
	trBars.createEl("th", { cls: "ratchet-grid-th-stat ratchet-grid-th-stat--bars" });
	trBars.createEl("th", { cls: "ratchet-grid-th-stat ratchet-grid-th-stat--bars" });
	trBars.createEl("th", { cls: "ratchet-grid-th-stat ratchet-grid-th-stat--bars" });

	const trWeek = thead.createEl("tr", { cls: "ratchet-grid-tr-weeks" });
	trWeek.createEl("th", { cls: "ratchet-grid-th-habit" });
	let d0 = 1;
	while (d0 <= dim) {
		const band = monthWeekBand(d0);
		const nextEnd = Math.min(dim, d0 + 6);
		const span = nextEnd - d0 + 1;
		const th = trWeek.createEl("th", {
			cls: `ratchet-grid-th-week ${WEEK_BAND_CLASS[band] ?? ""}`,
			attr: { colspan: String(span) },
		});
		th.setText(`Week ${band + 1}`);
		d0 = nextEnd + 1;
	}
	trWeek.createEl("th", { cls: "ratchet-grid-th-stat", text: "Goal" });
	trWeek.createEl("th", { cls: "ratchet-grid-th-stat", text: "%" });
	trWeek.createEl("th", { cls: "ratchet-grid-th-stat", text: "Count" });

	const trDow = thead.createEl("tr", { cls: "ratchet-grid-tr-dow" });
	trDow.createEl("th", { cls: "ratchet-grid-th-habit", text: "Habits" });
	for (let d = 1; d <= dim; d++) {
		trDow.createEl("th", {
			cls: `ratchet-grid-th-day ${WEEK_BAND_CLASS[monthWeekBand(d)]}`,
			text: dowInitial(y, m, d),
		});
	}
	trDow.createEl("th", { cls: "ratchet-grid-th-stat" });
	trDow.createEl("th", { cls: "ratchet-grid-th-stat" });
	trDow.createEl("th", { cls: "ratchet-grid-th-stat" });

	const trNum = thead.createEl("tr", { cls: "ratchet-grid-tr-num" });
	trNum.createEl("th");
	for (let d = 1; d <= dim; d++) {
		trNum.createEl("th", {
			cls: `ratchet-grid-th-num ${WEEK_BAND_CLASS[monthWeekBand(d)]}`,
			text: String(d),
		});
	}
	trNum.createEl("th");
	trNum.createEl("th");
	trNum.createEl("th");

	const tbody = table.createEl("tbody");

	for (const tracker of trackers) {
		const evM = eventsMonthByTracker.get(tracker.id) ?? [];
		const evY = tracker.resetPeriod === "yearly" ? eventsYearByTracker.get(tracker.id) ?? evM : null;
		const evW = tracker.resetPeriod === "weekly" ? eventsWeekByTracker.get(tracker.id) ?? evM : null;
		const det = details.get(tracker.id) ?? new Map();
		const stat: MonthStatColumn = computeMonthStatColumn(tracker, evM, evY, evW, det, y, m, firstDow);

		const tr = tbody.createEl("tr");
		const habitTh = tr.createEl("th", {
			cls: "ratchet-grid-habit-name",
			attr: { scope: "row" },
		});
		habitTh.createSpan({ cls: "ratchet-grid-habit-icon", text: tracker.icon || "📌" });
		habitTh.createSpan({ text: tracker.name });

		for (let day = 1; day <= dim; day++) {
			const cellDate = new Date(y, m, day, 12, 0, 0, 0);
			const row = det.get(day) ?? { count: 0, eventCount: 0 };
			const stCell = goalStatusForDayFromDetail(tracker, row.count, row.eventCount);
			const met = stCell === "met";
			const td = tr.createEl("td", {
				cls: `ratchet-grid-cell ${WEEK_BAND_CLASS[monthWeekBand(day)]}`,
			});
			const btn = td.createEl("button", {
				type: "button",
				cls: "ratchet-grid-cell-btn",
				attr: { "aria-label": `${tracker.name} ${day}` },
			});
			if (met) {
				btn.addClass("ratchet-grid-cell-btn--met");
				btn.style.setProperty("--ratchet-cell-accent", tracker.color || "#7c3aed");
			}
			btn.createSpan({
				cls: `ratchet-grid-cell-num${row.count === 0 ? " ratchet-grid-cell-num--zero" : ""}`,
				text: String(row.count),
			});

			btn.addEventListener("click", async (ev) => {
				ev.preventDefault();
				const trk = await dm.getTracker(tracker.id);
				if (!trk) return;
				const val = trk.goalType === "at most" && trk.goal === 0 ? 0 : 1;
				await dm.incrementOnDate(tracker.id, val, cellDate, val === 0 ? "done" : "");
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
		const td = tr.createEl("td", { attr: { colspan: String(dim + 4) } });
		td.createSpan({
			cls: "ratchet-grid-muted",
			text: "Create trackers from the dashboard (layout icon) to fill this grid.",
		});
	}

	const goalsBelow = root.createDiv({ cls: "ratchet-grid-goals ratchet-grid-goals--below" });
	goalsBelow.createEl("div", { cls: "ratchet-grid-goals-title", text: "Goals" });
	const goalsBody = goalsBelow.createDiv({ cls: "ratchet-grid-goals-body" });
	if (trackers.length === 0) {
		goalsBody.createSpan({ cls: "ratchet-grid-muted", text: "No trackers yet." });
	} else {
		for (const t of trackers) {
			const line = goalsBody.createDiv({ cls: "ratchet-grid-goal-line" });
			line.createSpan({ cls: "ratchet-grid-goal-name", text: t.name });
			if (t.goalType !== "none") {
				const pl = RESET_PERIOD_LABELS[t.resetPeriod];
				line.createSpan({
					cls: "ratchet-grid-goal-meta",
					text: ` · ${pl} ${t.goalType === "at least" ? "≥" : "≤"} ${t.goal}${t.unit ? ` ${t.unit}` : ""}`,
				});
			}
		}
	}
}
