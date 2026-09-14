import {formatMonthYear, gridDates, toISODate} from "./utils/calendarGrid";
import {todayLocalISODate} from "./utils/dates";
import {weekdayLabelsOrdered} from "./recurrence/recurrenceRuleBuilder";
import {
	isoForTaskDatePreset,
	TASK_DATE_PRESETS,
	type TaskDatePresetId,
} from "./taskSchedulePresets";

export type PickerDayCell = {
	iso: string;
	dayNum: number;
	inMonth: boolean;
	isToday: boolean;
	isSelected: boolean;
};

export function parsePickerIsoDate(raw: string | undefined): string {
	const date = raw?.trim().slice(0, 10) ?? "";
	return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function parsePickerIsoTime(raw: string | undefined): string {
	const init = raw?.trim() ?? "";
	if (/^\d{2}:\d{2}$/.test(init)) return init;
	const tMatch = init.match(/T(\d{2}:\d{2})/);
	return tMatch?.[1] ?? "";
}

export function viewMonthFromIso(iso: string, fallback = new Date()): {year: number; month: number} {
	if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
		const d = new Date(`${iso}T12:00:00`);
		if (!Number.isNaN(d.getTime())) {
			return {year: d.getFullYear(), month: d.getMonth()};
		}
	}
	return {year: fallback.getFullYear(), month: fallback.getMonth()};
}

export function shiftViewMonth(year: number, month: number, delta: number): {year: number; month: number} {
	const d = new Date(year, month + delta, 1, 12, 0, 0, 0);
	return {year: d.getFullYear(), month: d.getMonth()};
}

export function buildPickerMonthCells(opts: {
	viewYear: number;
	viewMonth: number;
	weekStartDay: number;
	selectedIso: string;
	todayIso: string;
}): PickerDayCell[] {
	const focal = new Date(opts.viewYear, opts.viewMonth, 1, 12, 0, 0, 0);
	return gridDates(focal, "month", opts.weekStartDay).map(({date, isCurrentMonth}) => {
		const iso = toISODate(date);
		return {
			iso,
			dayNum: date.getDate(),
			inMonth: isCurrentMonth,
			isToday: iso === opts.todayIso,
			isSelected: opts.selectedIso !== "" && iso === opts.selectedIso,
		};
	});
}

export type DateTimePickerHandle = {
	getDate(): string;
	getTime(): string;
	setDate(iso: string): void;
	setTime(hhmm: string): void;
};

export type DateTimePickerOptions = {
	date: string;
	time: string;
	weekStartDay: number;
	timeHint?: string;
	onDateChange?: (iso: string) => void;
	onTimeChange?: (hhmm: string) => void;
};

export function mountDateTimePicker(
	container: HTMLElement,
	opts: DateTimePickerOptions,
): DateTimePickerHandle {
	const weekStartDay = ((opts.weekStartDay % 7) + 7) % 7;
	let dateIso = parsePickerIsoDate(opts.date);
	let timeValue = parsePickerIsoTime(opts.time);
	let view = viewMonthFromIso(dateIso || todayLocalISODate());

	const root = container.createDiv({cls: "fulcrum-date-picker"});

	const presetRow = root.createDiv({
		cls: "fulcrum-date-picker__presets",
		attr: {role: "group", "aria-label": "Quick dates"},
	});
	const presetButtons = new Map<TaskDatePresetId, HTMLButtonElement>();
	for (const preset of TASK_DATE_PRESETS) {
		const btn = presetRow.createEl("button", {
			type: "button",
			text: preset.title,
			cls: "fulcrum-date-picker__preset",
		});
		btn.onclick = () => {
			applyDate(isoForTaskDatePreset(preset.id, weekStartDay));
		};
		presetButtons.set(preset.id, btn);
	}

	const cal = root.createDiv({cls: "fulcrum-date-picker__cal"});
	const nav = cal.createDiv({cls: "fulcrum-date-picker__nav", attr: {role: "toolbar", "aria-label": "Month"}});
	const prevBtn = nav.createEl("button", {
		type: "button",
		text: "‹",
		cls: "fulcrum-date-picker__nav-btn",
		attr: {"aria-label": "Previous month"},
	});
	const titleEl = nav.createEl("div", {cls: "fulcrum-date-picker__month"});
	const nextBtn = nav.createEl("button", {
		type: "button",
		text: "›",
		cls: "fulcrum-date-picker__nav-btn",
		attr: {"aria-label": "Next month"},
	});
	prevBtn.onclick = () => {
		view = shiftViewMonth(view.year, view.month, -1);
		renderGrid();
	};
	nextBtn.onclick = () => {
		view = shiftViewMonth(view.year, view.month, 1);
		renderGrid();
	};

	const dowRow = cal.createDiv({cls: "fulcrum-date-picker__dows", attr: {"aria-hidden": "true"}});
	for (const wd of weekdayLabelsOrdered(weekStartDay)) {
		dowRow.createEl("span", {cls: "fulcrum-date-picker__dow", text: wd.label.slice(0, 2)});
	}

	const gridEl = cal.createDiv({
		cls: "fulcrum-date-picker__grid",
		attr: {role: "grid", "aria-label": "Choose date"},
	});

	const timeRow = root.createDiv({cls: "fulcrum-date-picker__time"});
	timeRow.createEl("span", {cls: "fulcrum-date-picker__time-label", text: "Time"});
	const timeInput = timeRow.createEl("input", {
		type: "time",
		cls: "fulcrum-date-picker__time-input",
		attr: {"aria-label": "Time"},
	});
	if (/^\d{2}:\d{2}$/.test(timeValue)) timeInput.value = timeValue;
	timeInput.addEventListener("change", () => {
		timeValue = timeInput.value;
		opts.onTimeChange?.(timeValue);
	});
	timeRow.createEl("span", {
		cls: "fulcrum-date-picker__time-hint",
		text: opts.timeHint ?? "Leave empty for all-day.",
	});

	function applyDate(iso: string, notify = true): void {
		const next = parsePickerIsoDate(iso);
		const changed = next !== dateIso;
		dateIso = next;
		if (dateIso) view = viewMonthFromIso(dateIso);
		if (changed && notify) opts.onDateChange?.(dateIso);
		renderGrid();
		syncPresets();
	}

	function syncPresets(): void {
		for (const preset of TASK_DATE_PRESETS) {
			const btn = presetButtons.get(preset.id);
			if (!btn) continue;
			const active = dateIso !== "" && dateIso === isoForTaskDatePreset(preset.id, weekStartDay);
			btn.classList.toggle("is-active", active);
			btn.setAttr("aria-pressed", active ? "true" : "false");
		}
	}

	function renderGrid(): void {
		const todayIso = todayLocalISODate();
		titleEl.setText(formatMonthYear(new Date(view.year, view.month, 1, 12, 0, 0, 0)));
		gridEl.empty();
		const cells = buildPickerMonthCells({
			viewYear: view.year,
			viewMonth: view.month,
			weekStartDay,
			selectedIso: dateIso,
			todayIso,
		});
		for (const cell of cells) {
			const btn = gridEl.createEl("button", {
				type: "button",
				text: String(cell.dayNum),
				cls: "fulcrum-date-picker__day",
				attr: {
					role: "gridcell",
					"aria-label": cell.iso,
				},
			});
			btn.classList.toggle("fulcrum-date-picker__day--other", !cell.inMonth);
			btn.classList.toggle("fulcrum-date-picker__day--today", cell.isToday);
			btn.classList.toggle("fulcrum-date-picker__day--selected", cell.isSelected);
			if (cell.isSelected) btn.setAttr("aria-selected", "true");
			if (cell.isToday) btn.setAttr("aria-current", "date");
			btn.onclick = () => applyDate(cell.iso);
		}
	}

	renderGrid();
	syncPresets();

	return {
		getDate: () => dateIso,
		getTime: () => timeValue,
		setDate: (iso) => applyDate(iso, false),
		setTime: (hhmm) => {
			const next = parsePickerIsoTime(hhmm);
			const changed = next !== timeValue;
			timeValue = next;
			timeInput.value = timeValue;
			if (changed) opts.onTimeChange?.(timeValue);
		},
	};
}
