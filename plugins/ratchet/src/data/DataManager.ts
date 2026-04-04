import type { Vault } from "obsidian";
import { getMonthKey, isInPeriod, type ResetPeriod } from "../utils/DateUtils";
import { parseEventLine, eventToLine, type RatchetEvent } from "./EventLog";
import type { TrackerConfig, RatchetConfigFile, GoalType } from "./TrackerConfig";

const CONFIG_FILE = "config.json";
const EVENTS_DIR = "events";
const CONFIG_VERSION = "1.0.0";

export type { RatchetEvent, TrackerConfig };

export class DataManager {
	constructor(
		private vault: Vault,
		private dataFolder: string,
		private firstDayOfWeek: number,
	) {}

	private configPath(): string {
		return `${this.dataFolder}/${CONFIG_FILE}`;
	}

	private eventsDir(): string {
		return `${this.dataFolder}/${EVENTS_DIR}`;
	}

	private eventFilePath(monthKey: string): string {
		return `${this.eventsDir()}/${monthKey}.jsonl`;
	}

	async ensureDataFolder(): Promise<void> {
		const dir = this.eventsDir();
		if (!(await this.vault.adapter.exists(dir))) {
			await this.vault.adapter.mkdir(dir);
		}
	}

	private async readConfig(): Promise<RatchetConfigFile> {
		const path = this.configPath();
		try {
			const raw = await this.vault.adapter.read(path);
			const data = JSON.parse(raw) as RatchetConfigFile;
			if (data && data.trackers && typeof data.trackers === "object") {
				return data;
			}
		} catch {
			// no file or invalid
		}
		return { version: CONFIG_VERSION, trackers: {} };
	}

	private async writeConfig(config: RatchetConfigFile): Promise<void> {
		await this.ensureDataFolder();
		await this.vault.adapter.write(this.configPath(), JSON.stringify(config, null, "\t"));
	}

	private normalizeTracker(t: TrackerConfig): TrackerConfig {
		return {
			...t,
			goalType: (t as TrackerConfig & { goalType?: GoalType }).goalType ?? "at least",
		};
	}

	async getAllTrackers(): Promise<TrackerConfig[]> {
		const config = await this.readConfig();
		return Object.values(config.trackers).map((t) => this.normalizeTracker(t));
	}

	async getTracker(id: string): Promise<TrackerConfig | null> {
		const config = await this.readConfig();
		const t = config.trackers[id] ?? null;
		return t ? this.normalizeTracker(t) : null;
	}

	async createTracker(config: TrackerConfig): Promise<void> {
		const data = await this.readConfig();
		data.trackers[config.id] = config;
		await this.writeConfig(data);
	}

	async updateTracker(id: string, updates: Partial<TrackerConfig>): Promise<void> {
		const data = await this.readConfig();
		const existing = data.trackers[id];
		if (!existing) return;
		data.trackers[id] = { ...existing, ...updates };
		await this.writeConfig(data);
	}

	async deleteTracker(id: string): Promise<void> {
		const data = await this.readConfig();
		delete data.trackers[id];
		await this.writeConfig(data);
	}

	/** Month keys to read for current period (e.g. this month + last for weekly). */
	private monthKeysToRead(period: ResetPeriod, now: Date): string[] {
		const keys: string[] = [];
		const current = getMonthKey(now);
		keys.push(current);
		if (period === "weekly" || period === "daily") {
			const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			keys.push(getMonthKey(prev));
		}
		if (period === "yearly") {
			const y = now.getFullYear();
			for (let m = 0; m < 12; m++) keys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
		}
		return [...new Set(keys)];
	}

	private async readEventsForTracker(trackerId: string, monthKeys: string[]): Promise<RatchetEvent[]> {
		const events: RatchetEvent[] = [];
		for (const key of monthKeys) {
			const path = this.eventFilePath(key);
			try {
				const content = await this.vault.adapter.read(path);
				for (const line of content.split("\n")) {
					const e = parseEventLine(line);
					if (e && e.tracker === trackerId) events.push(e);
				}
			} catch {
				// file missing or unreadable
			}
		}
		events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		return events;
	}

	async getCurrentCount(trackerId: string, trackerPeriod?: ResetPeriod): Promise<number> {
		const tracker = await this.getTracker(trackerId);
		const period = trackerPeriod ?? tracker?.resetPeriod ?? "daily";
		const now = new Date();
		const keys = this.monthKeysToRead(period, now);
		const events = await this.readEventsForTracker(trackerId, keys);
		let sum = 0;
		for (const e of events) {
			if (isInPeriod(e.timestamp, period, now, this.firstDayOfWeek)) {
				sum += e.value;
			}
		}
		return sum;
	}

	/**
	 * For "at least" goals: true if the running sum ever reached >= goal this period
	 * (so toggling +1 then -1 back to 0 still shows as "goal met").
	 * For "at most": true if current count <= goal (no running-sum check needed).
	 */
	async getGoalWasEverMetThisPeriod(trackerId: string): Promise<boolean> {
		const tracker = await this.getTracker(trackerId);
		if (!tracker || tracker.goalType === "none") return false;
		const now = new Date();
		const period = tracker.resetPeriod;
		const keys = this.monthKeysToRead(period, now);
		const events = await this.readEventsForTracker(trackerId, keys);
		const inPeriod = events.filter((e) => isInPeriod(e.timestamp, period, now, this.firstDayOfWeek));
		if (tracker.goalType === "at most") {
			const sum = inPeriod.reduce((s, e) => s + e.value, 0);
			return sum <= tracker.goal;
		}
		// at least: running sum ever >= goal?
		let sum = 0;
		for (const e of inPeriod) {
			sum += e.value;
			if (tracker.goal > 0 && sum >= tracker.goal) return true;
		}
		return false;
	}

	/** Sum of event values for a single calendar day (local date). */
	async getCountForDay(trackerId: string, date: Date): Promise<number> {
		const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		const events = await this.getHistory(trackerId, start, new Date(end.getTime() - 1));
		return events.reduce((sum, e) => sum + e.value, 0);
	}

	/** Whether the goal was met on that calendar day (for heatmap). */
	async getGoalMetForDay(trackerId: string, date: Date): Promise<boolean> {
		const status = await this.getGoalStatusForDay(trackerId, date);
		return status === "met";
	}

	/**
	 * Goal status for a single day (for heatmap). Returns "no_data" when there are no events
	 * that day, so historical days without logging show as grey instead of met.
	 */
	async getGoalStatusForDay(trackerId: string, date: Date): Promise<"met" | "not_met" | "no_data"> {
		const tracker = await this.getTracker(trackerId);
		if (!tracker || tracker.goalType === "none") return "no_data";
		const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		const events = await this.getHistory(trackerId, start, new Date(end.getTime() - 1));
		if (events.length === 0) return "no_data";
		const count = events.reduce((sum, e) => sum + e.value, 0);
		const met =
			tracker.goalType === "at least" ? tracker.goal <= 0 || count >= tracker.goal : count <= tracker.goal;
		return met ? "met" : "not_met";
	}

	/** Day key YYYY-MM-DD in local time */
	private static dateKey(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	/**
	 * Entries per day in range (for edit-history grid). One read for the whole range.
	 * Sorted by date descending (most recent first).
	 */
	async getDayEntries(
		trackerId: string,
		startDate: Date,
		endDate: Date,
	): Promise<{ dateKey: string; date: Date; count: number; eventCount: number; hasDoneMarker: boolean }[]> {
		const events = await this.getHistory(trackerId, startDate, endDate);
		const byDay = new Map<string, { count: number; eventCount: number; hasDoneMarker: boolean }>();
		for (const e of events) {
			const d = new Date(e.timestamp);
			const key = DataManager.dateKey(d);
			const cur = byDay.get(key) ?? {
				count: 0,
				eventCount: 0,
				hasDoneMarker: false,
			};
			cur.count += e.value;
			cur.eventCount += 1;
			if (e.value === 0) cur.hasDoneMarker = true;
			byDay.set(key, cur);
		}
		const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
		const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
		const out: { dateKey: string; date: Date; count: number; eventCount: number; hasDoneMarker: boolean }[] = [];
		for (const d = new Date(end); d.getTime() >= start.getTime(); d.setDate(d.getDate() - 1)) {
			const key = DataManager.dateKey(d);
			const row = byDay.get(key);
			out.push({
				dateKey: key,
				date: new Date(d),
				count: row?.count ?? 0,
				eventCount: row?.eventCount ?? 0,
				hasDoneMarker: row?.hasDoneMarker ?? false,
			});
		}
		return out;
	}

	/** Sum of event values in an inclusive time range (local). */
	async sumEventsInRange(trackerId: string, startDate: Date, endDate: Date): Promise<number> {
		const events = await this.getHistory(trackerId, startDate, endDate);
		return events.reduce((sum, e) => sum + e.value, 0);
	}

	async getHistory(trackerId: string, startDate: Date, endDate: Date): Promise<RatchetEvent[]> {
		const startKey = getMonthKey(startDate);
		const endKey = getMonthKey(endDate);
		const keys: string[] = [];
		const [sy, sm] = startKey.split("-").map(Number);
		const [ey, em] = endKey.split("-").map(Number);
		for (let y = sy; y <= ey; y++) {
			const mStart = y === sy ? sm : 1;
			const mEnd = y === ey ? em : 12;
			for (let m = mStart; m <= mEnd; m++) {
				keys.push(`${y}-${String(m).padStart(2, "0")}`);
			}
		}
		const events = await this.readEventsForTracker(trackerId, keys);
		const startMs = startDate.getTime();
		const endMs = endDate.getTime();
		return events.filter((e) => {
			const t = new Date(e.timestamp).getTime();
			return t >= startMs && t <= endMs;
		});
	}

	async increment(trackerId: string, value: number, note = ""): Promise<void> {
		await this.incrementOnDate(trackerId, value, new Date(), note);
	}

	/** Add an event for a specific calendar day (e.g. from heatmap click). Uses noon local so it unambiguously belongs to that day. */
	async incrementOnDate(trackerId: string, value: number, date: Date, note = ""): Promise<void> {
		await this.ensureDataFolder();
		const year = date.getFullYear();
		const month = date.getMonth();
		const day = date.getDate();
		const atNoon = new Date(year, month, day, 12, 0, 0, 0);
		const monthKey = getMonthKey(atNoon);
		const path = this.eventFilePath(monthKey);
		const event: RatchetEvent = {
			id:
				typeof crypto !== "undefined" && crypto.randomUUID
					? crypto.randomUUID()
					: `e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			timestamp: atNoon.toISOString(),
			tracker: trackerId,
			value,
			note,
		};
		const line = eventToLine(event);
		try {
			const existing = await this.vault.adapter.read(path).catch(() => "");
			await this.vault.adapter.write(path, existing + line);
		} catch {
			await this.vault.adapter.write(path, line);
		}
	}

	/**
	 * Remove all events for this tracker on this local calendar day (grid / heatmap “reset day”).
	 */
	async clearEventsForTrackerOnDay(trackerId: string, date: Date): Promise<void> {
		const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		const startMs = start.getTime();
		const endMs = end.getTime();
		const monthKey = getMonthKey(start);
		const path = this.eventFilePath(monthKey);
		let raw = "";
		try {
			raw = await this.vault.adapter.read(path);
		} catch {
			return;
		}
		const lines = raw.split("\n");
		const kept: string[] = [];
		for (const line of lines) {
			const e = parseEventLine(line);
			if (!e) {
				if (line.trim()) kept.push(line);
				continue;
			}
			if (e.tracker !== trackerId) {
				kept.push(line);
				continue;
			}
			const t = new Date(e.timestamp).getTime();
			if (t >= startMs && t < endMs) continue;
			kept.push(line);
		}
		const text = kept.join("\n");
		await this.vault.adapter.write(path, text ? `${text}\n` : "");
	}
}
