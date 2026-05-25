import type RatchetPlugin from "../main";
import type { TrackerConfig } from "../data/TrackerConfig";
import { isCheckOffHabit } from "../data/TrackerConfig";
import { toggleCheckOffDay, checkOffDayDone } from "./checkOffDay";
import { habitDayStatus } from "./habitDayStatus";
import { startOfWeekLocal } from "../utils/DateUtils";

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
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const calendarViewByTracker = new Map<string, { year: number; month: number }>();

function viewMonthForTracker(trackerId: string): { year: number; month: number } {
	const now = new Date();
	const cur = calendarViewByTracker.get(trackerId);
	if (cur) return cur;
	return { year: now.getFullYear(), month: now.getMonth() };
}

function setViewMonth(trackerId: string, year: number, month: number): void {
	calendarViewByTracker.set(trackerId, { year, month });
}

function dateKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export async function renderHabitCalendar(
	mount: HTMLElement,
	plugin: RatchetPlugin,
	tracker: TrackerConfig,
	onRefresh: () => void,
): Promise<void> {
	mount.empty();
	mount.addClass("ratchet-habit-section");

	const { year, month } = viewMonthForTracker(tracker.id);
	const dm = plugin.getDataManager();
	const firstDayOfWeek = plugin.settings.firstDayOfWeek;
	const checkOff = isCheckOffHabit(tracker);

	const monthStart = new Date(year, month, 1);
	const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
	const entries = await dm.getDayEntries(tracker.id, monthStart, monthEnd);
	const byDay = new Map(entries.map((e) => [e.dateKey, e]));

	const head = mount.createDiv({ cls: "ratchet-habit-section__head" });
	head.createEl("h2", { cls: "ratchet-habit-section__title", text: "Calendar" });

	const nav = head.createDiv({ cls: "ratchet-habit-cal-nav" });
	const prevBtn = nav.createEl("button", {
		type: "button",
		cls: "ratchet-habit-cal-nav__btn clickable-icon",
		attr: { "aria-label": "Previous month" },
		text: "‹",
	});
	const title = nav.createSpan({
		cls: "ratchet-habit-cal-nav__title",
		text: `${MONTH_NAMES[month]} ${year}`,
	});
	const nextBtn = nav.createEl("button", {
		type: "button",
		cls: "ratchet-habit-cal-nav__btn clickable-icon",
		attr: { "aria-label": "Next month" },
		text: "›",
	});

	prevBtn.addEventListener("click", () => {
		const d = new Date(year, month - 1, 1);
		setViewMonth(tracker.id, d.getFullYear(), d.getMonth());
		onRefresh();
	});
	nextBtn.addEventListener("click", () => {
		const d = new Date(year, month + 1, 1);
		setViewMonth(tracker.id, d.getFullYear(), d.getMonth());
		onRefresh();
	});

	const grid = mount.createDiv({ cls: "ratchet-habit-cal" });
	const headerRow = grid.createDiv({ cls: "ratchet-habit-cal__header" });
	for (let i = 0; i < 7; i++) {
		const dow = (firstDayOfWeek + i) % 7;
		headerRow.createDiv({ cls: "ratchet-habit-cal__dow", text: DOW_NAMES[dow] });
	}

	const cells = grid.createDiv({ cls: "ratchet-habit-cal__cells" });
	const gridStart = startOfWeekLocal(monthStart, firstDayOfWeek);
	const gridEnd = startOfWeekLocal(monthEnd, firstDayOfWeek);
	gridEnd.setDate(gridEnd.getDate() + 6);

	const todayKey = dateKey(new Date());

	for (let d = new Date(gridStart); d.getTime() <= gridEnd.getTime(); d.setDate(d.getDate() + 1)) {
		const cellDate = new Date(d);
		const key = dateKey(cellDate);
		const inMonth = cellDate.getMonth() === month;
		const entry = byDay.get(key);
		const count = entry?.count ?? 0;
		const eventCount = entry?.eventCount ?? 0;
		const hasDoneMarker = entry?.hasDoneMarker ?? false;
		const status = inMonth ? habitDayStatus(tracker, count, eventCount, hasDoneMarker) : "none";

		const cell = cells.createDiv({
			cls: `ratchet-habit-cal__cell ${inMonth ? "" : "ratchet-habit-cal__cell--out"} ratchet-habit-cal__cell--${status}`,
		});

		cell.createSpan({ cls: "ratchet-habit-cal__day-num", text: String(cellDate.getDate()) });
		if (inMonth && !checkOff && count > 0) {
			cell.createSpan({ cls: "ratchet-habit-cal__count", text: String(count) });
		}
		if (key === todayKey && inMonth) cell.addClass("ratchet-habit-cal__cell--today");

		if (inMonth) {
			const controls = cell.createDiv({ cls: "ratchet-habit-cal__controls" });
			if (checkOff) {
				const done = checkOffDayDone({ count, eventCount, hasDoneMarker });
				const toggleBtn = controls.createEl("button", {
					type: "button",
					cls: `ratchet-habit-cal__toggle${done ? " ratchet-habit-cal__toggle--on" : ""}`,
					attr: {
						"aria-label": done ? `Mark ${cellDate.getDate()} not done` : `Mark ${cellDate.getDate()} done`,
						"aria-pressed": done ? "true" : "false",
					},
					text: done ? "✓" : "",
				});
				toggleBtn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					void (async () => {
						await toggleCheckOffDay(dm, tracker.id, cellDate, { count, eventCount, hasDoneMarker });
						onRefresh();
					})();
				});
			} else {
				const minusBtn = controls.createEl("button", {
					type: "button",
					cls: "ratchet-habit-cal__adj",
					text: "−",
					attr: { "aria-label": `Decrease count on ${title.textContent} ${cellDate.getDate()}` },
				});
				const plusBtn = controls.createEl("button", {
					type: "button",
					cls: "ratchet-habit-cal__adj",
					text: "+",
					attr: { "aria-label": `Increase count on ${title.textContent} ${cellDate.getDate()}` },
				});

				minusBtn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					void (async () => {
						if (count <= 0) return;
						await dm.incrementOnDate(tracker.id, -1, cellDate);
						onRefresh();
					})();
				});
				plusBtn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					void (async () => {
						await dm.incrementOnDate(tracker.id, 1, cellDate);
						onRefresh();
					})();
				});
			}
		}
	}
}
