/** 0 = Sunday … 6 = Saturday (matches JS Date.getDay). */
const DOW_TO_RRULE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const RRULE_TO_DOW: Record<string, number> = {
	SU: 0,
	MO: 1,
	TU: 2,
	WE: 3,
	TH: 4,
	FR: 5,
	SA: 6,
};
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "custom";

export type MonthlyMode =
	| "firstDay"
	| "lastDay"
	| "firstWeekday"
	| "lastWeekday"
	| "firstWeekdayNamed"
	| "lastWeekdayNamed"
	| "onDays";

export interface RecurrenceUiState {
	freq: RecurrenceFreq;
	/** Repeat every N periods (1 = every week/day/month). */
	interval: number;
	weeklyDays: number[];
	monthlyMode: MonthlyMode;
	monthlyWeekday: number;
	/** Comma-separated calendar days 1–31 (monthly onDays). */
	monthlyDays: string;
}

function clampInterval(n: number): number {
	if (!Number.isFinite(n) || n < 1) return 1;
	return Math.min(99, Math.round(n));
}

function intervalToken(interval: number): string {
	const n = clampInterval(interval);
	return n > 1 ? `;INTERVAL=${n}` : "";
}

export function weekdayLabelsOrdered(weekStart: number): {dow: number; label: string}[] {
	const out: {dow: number; label: string}[] = [];
	for (let i = 0; i < 7; i++) {
		const dow = (weekStart + i) % 7;
		out.push({dow, label: WEEKDAY_LABELS[dow] ?? "?"});
	}
	return out;
}

export function defaultRecurrenceUiState(
	freq: RecurrenceFreq = "weekly",
	scheduledDate?: string,
): RecurrenceUiState {
	const startDow = scheduledDate
		? new Date(scheduledDate.slice(0, 10) + "T12:00:00").getDay()
		: new Date().getDay();
	const startDay = scheduledDate
		? new Date(scheduledDate.slice(0, 10) + "T12:00:00").getDate()
		: new Date().getDate();
	return {
		freq,
		interval: 1,
		weeklyDays: freq === "weekly" ? [startDow] : [],
		monthlyMode: "firstDay",
		monthlyWeekday: startDow,
		monthlyDays: String(startDay),
	};
}

function dtStartToken(startIso: string): string {
	return startIso.slice(0, 10).replace(/-/g, "") + "T120000";
}

/** Parse comma-separated month days (1–31), deduped and sorted. */
export function parseMonthlyDaysInput(raw: string): number[] {
	const seen = new Set<number>();
	const out: number[] = [];
	for (const part of raw.split(/[,;\s]+/)) {
		const n = Number.parseInt(part.trim(), 10);
		if (!Number.isFinite(n) || n < 1 || n > 31) continue;
		if (seen.has(n)) continue;
		seen.add(n);
		out.push(n);
	}
	return out.sort((a, b) => a - b);
}

/** First date on or after startIso whose weekday is in weeklyDays (for DTSTART alignment). */
function alignWeeklyDtStart(startIso: string, weeklyDays: number[]): string {
	const days = weeklyDays.length > 0 ? weeklyDays : [new Date(startIso.slice(0, 10) + "T12:00:00").getDay()];
	const start = new Date(startIso.slice(0, 10) + "T12:00:00");
	for (let offset = 0; offset < 7; offset++) {
		const d = new Date(start);
		d.setDate(d.getDate() + offset);
		if (days.includes(d.getDay())) {
			const y = d.getFullYear();
			const mo = String(d.getMonth() + 1).padStart(2, "0");
			const day = String(d.getDate()).padStart(2, "0");
			return `${y}-${mo}-${day}`;
		}
	}
	return startIso.slice(0, 10);
}

export function buildRecurrenceRule(state: RecurrenceUiState, startIso: string): string {
	switch (state.freq) {
		case "daily": {
			const dt = dtStartToken(startIso);
			return `DTSTART:${dt};FREQ=DAILY${intervalToken(state.interval)}`;
		}
		case "weekly": {
			const aligned = alignWeeklyDtStart(startIso, state.weeklyDays);
			const dt = dtStartToken(aligned);
			const days = [...state.weeklyDays]
				.sort((a, b) => a - b)
				.map((d) => DOW_TO_RRULE[d] ?? "MO")
				.join(",");
			return `DTSTART:${dt};FREQ=WEEKLY${intervalToken(state.interval)};BYDAY=${days || "MO"}`;
		}
		case "monthly": {
			const dt = dtStartToken(startIso);
			const prefix = `DTSTART:${dt}`;
			const every = intervalToken(state.interval);
			switch (state.monthlyMode) {
				case "firstDay":
					return `${prefix};FREQ=MONTHLY${every};BYMONTHDAY=1`;
				case "lastDay":
					return `${prefix};FREQ=MONTHLY${every};BYMONTHDAY=-1`;
				case "firstWeekday":
					return `${prefix};FREQ=MONTHLY${every};BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1`;
				case "lastWeekday":
					return `${prefix};FREQ=MONTHLY${every};BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1`;
				case "firstWeekdayNamed": {
					const day = DOW_TO_RRULE[state.monthlyWeekday] ?? "MO";
					return `${prefix};FREQ=MONTHLY${every};BYDAY=${day};BYSETPOS=1`;
				}
				case "lastWeekdayNamed": {
					const day = DOW_TO_RRULE[state.monthlyWeekday] ?? "MO";
					return `${prefix};FREQ=MONTHLY${every};BYDAY=${day};BYSETPOS=-1`;
				}
				case "onDays": {
					const monthDays = parseMonthlyDaysInput(state.monthlyDays);
					const byMonthDay = monthDays.length > 0 ? monthDays.join(",") : "1";
					return `${prefix};FREQ=MONTHLY${every};BYMONTHDAY=${byMonthDay}`;
				}
			}
		}
		default: {
			const dt = dtStartToken(startIso);
			return `DTSTART:${dt};FREQ=DAILY`;
		}
	}
}

function parseRuleParts(recurrence: string): Map<string, string> {
	const parts = new Map<string, string>();
	const raw = recurrence.trim();
	if (!raw) return parts;
	for (const segment of raw.split(";")) {
		const eq = segment.indexOf("=");
		if (eq < 0) {
			if (segment.startsWith("DTSTART")) parts.set("DTSTART", segment.slice(7));
			else parts.set(segment, "");
		} else {
			parts.set(segment.slice(0, eq), segment.slice(eq + 1));
		}
	}
	return parts;
}

export function parseRecurrenceToUiState(
	recurrence: string,
	scheduledDate?: string,
): RecurrenceUiState | null {
	const raw = recurrence.trim();
	if (!raw) return null;

	const parts = parseRuleParts(raw);
	const freq = (parts.get("FREQ") ?? "").toUpperCase();
	const defaults = defaultRecurrenceUiState("weekly", scheduledDate);
	const interval = clampInterval(Number.parseInt(parts.get("INTERVAL") ?? "1", 10));

	if (freq === "DAILY") {
		return {...defaults, freq: "daily", interval, weeklyDays: []};
	}

	if (freq === "WEEKLY") {
		const byday = (parts.get("BYDAY") ?? "")
			.split(",")
			.map((d) => RRULE_TO_DOW[d.trim().toUpperCase()])
			.filter((d): d is number => d != null);
		return {
			...defaults,
			freq: "weekly",
			interval,
			weeklyDays: byday.length > 0 ? byday : defaults.weeklyDays,
		};
	}

	if (freq === "MONTHLY") {
		const byMonthDay = parts.get("BYMONTHDAY");
		if (byMonthDay === "1") {
			return {...defaults, freq: "monthly", interval, monthlyMode: "firstDay"};
		}
		if (byMonthDay === "-1") {
			return {...defaults, freq: "monthly", interval, monthlyMode: "lastDay"};
		}
		if (byMonthDay && !parts.get("BYDAY") && !parts.get("BYSETPOS")) {
			const nums = parseMonthlyDaysInput(byMonthDay.replace(/;/g, ","));
			if (nums.length > 0 && !(nums.length === 1 && nums[0] === 1)) {
				return {
					...defaults,
					freq: "monthly",
					interval,
					monthlyMode: "onDays",
					monthlyDays: nums.join(", "),
				};
			}
		}

		const byday = parts.get("BYDAY") ?? "";
		const setpos = parts.get("BYSETPOS");
		if (byday === "MO,TU,WE,TH,FR" && setpos === "1") {
			return {...defaults, freq: "monthly", interval, monthlyMode: "firstWeekday"};
		}
		if (byday === "MO,TU,WE,TH,FR" && setpos === "-1") {
			return {...defaults, freq: "monthly", interval, monthlyMode: "lastWeekday"};
		}

		const days = byday.split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
		if (days.length === 1 && setpos === "1") {
			return {
				...defaults,
				freq: "monthly",
				interval,
				monthlyMode: "firstWeekdayNamed",
				monthlyWeekday: RRULE_TO_DOW[days[0]!] ?? defaults.monthlyWeekday,
			};
		}
		if (days.length === 1 && setpos === "-1") {
			return {
				...defaults,
				freq: "monthly",
				interval,
				monthlyMode: "lastWeekdayNamed",
				monthlyWeekday: RRULE_TO_DOW[days[0]!] ?? defaults.monthlyWeekday,
			};
		}
	}

	return null;
}

const MONTHLY_LABELS: Record<MonthlyMode, string> = {
	firstDay: "First day of month",
	lastDay: "Last day of month",
	firstWeekday: "First weekday of month",
	lastWeekday: "Last weekday of month",
	firstWeekdayNamed: "First",
	lastWeekdayNamed: "Last",
	onDays: "On day(s)",
};

function everyLabel(interval: number, unit: string): string {
	const n = clampInterval(interval);
	return n > 1 ? `Every ${n} ${unit}` : `Every ${unit.replace(/s$/, "")}`;
}

export function describeRecurrenceUiState(state: RecurrenceUiState): string {
	switch (state.freq) {
		case "daily":
			return clampInterval(state.interval) > 1
				? everyLabel(state.interval, "days")
				: "Daily";
		case "weekly": {
			const labels = state.weeklyDays
				.sort((a, b) => a - b)
				.map((d) => WEEKDAY_LABELS[d] ?? "?")
				.join(", ");
			const prefix =
				clampInterval(state.interval) > 1
					? everyLabel(state.interval, "weeks")
					: "Weekly";
			return labels ? `${prefix} on ${labels}` : prefix;
		}
		case "monthly": {
			const prefix =
				clampInterval(state.interval) > 1
					? everyLabel(state.interval, "months")
					: "Monthly";
			if (state.monthlyMode === "onDays") {
				const days = parseMonthlyDaysInput(state.monthlyDays);
				return days.length > 0
					? `${prefix} on day ${days.join(", ")}`
					: `${prefix} on day(s)`;
			}
			if (state.monthlyMode === "firstWeekdayNamed" || state.monthlyMode === "lastWeekdayNamed") {
				const pos = state.monthlyMode === "firstWeekdayNamed" ? "first" : "last";
				const day = WEEKDAY_LABELS[state.monthlyWeekday] ?? "?";
				return `${prefix} on ${pos} ${day}`;
			}
			return `${prefix} · ${MONTHLY_LABELS[state.monthlyMode]}`;
		}
		default:
			return "Custom recurrence";
	}
}
