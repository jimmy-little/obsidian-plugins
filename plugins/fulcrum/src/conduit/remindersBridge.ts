import {requestUrl} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {
	BridgeCalendarEvent,
	BridgeCalendarRow,
	CreateReminderOptions,
	FulcrumReminder,
	ReminderListRow,
	UpdateReminderOptions,
} from "./types";

export interface RemindersBridge {
	health(): Promise<{ok: boolean; detail?: string; remindersRevision?: number}>;
	revision(): Promise<number>;
	lists(): Promise<ReminderListRow[]>;
	fetchAllReminders(): Promise<FulcrumReminder[]>;
	fetchReminders(opts?: {listIds?: string[]; inbox?: boolean}): Promise<FulcrumReminder[]>;
	get(id: string): Promise<FulcrumReminder>;
	complete(id: string): Promise<void>;
	reopen(id: string): Promise<void>;
	create(opts: CreateReminderOptions): Promise<string>;
	update(id: string, patch: UpdateReminderOptions): Promise<void>;
	deleteReminder(id: string): Promise<void>;
	editReminder(id: string, patch: UpdateReminderOptions): Promise<void>;
	listCreate(name: string, color?: {color: string; usePrivate: boolean}): Promise<string>;
	listEdit(listId: string, opts: {color?: string; usePrivate?: boolean}): Promise<void>;
	calendars(): Promise<BridgeCalendarRow[]>;
	events(fromIso: string, toIso: string, calendarIds: string[]): Promise<BridgeCalendarEvent[]>;
}

export class HttpRemindersBridge implements RemindersBridge {
	constructor(
		private readonly baseUrl: string,
		private readonly token: string,
	) {}

	static fromSettings(settings: FulcrumSettings): HttpRemindersBridge {
		const url = settings.remindersBridgeUrl.trim() || "http://127.0.0.1:9247";
		return new HttpRemindersBridge(url, settings.remindersBridgeToken);
	}

	private url(path: string): string {
		return `${this.baseUrl.replace(/\/+$/, "")}${path}`;
	}

	private headers(): Record<string, string> {
		const h: Record<string, string> = {"Content-Type": "application/json"};
		if (this.token.trim()) h.Authorization = `Bearer ${this.token.trim()}`;
		return h;
	}

	private async request<T>(path: string, init?: {method?: string; body?: string}): Promise<T> {
		const res = await requestUrl({
			url: this.url(path),
			method: init?.method ?? "GET",
			headers: this.headers(),
			body: init?.body,
			throw: false,
		});
		if (res.status === 404) {
			throw new Error(`Reminder not found (${path}).`);
		}
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`Bridge ${path}: ${res.status} ${res.text}`.trim());
		}
		if (res.status === 204) return undefined as T;
		return res.json as T;
	}

	async ping(): Promise<boolean> {
		try {
			const res = await requestUrl({
				url: this.url("/health"),
				method: "GET",
				headers: this.headers(),
				throw: false,
			});
			return res.status >= 200 && res.status < 300;
		} catch {
			return false;
		}
	}

	async health(): Promise<{ok: boolean; detail?: string; remindersRevision?: number}> {
		try {
			const raw = await this.request<{
				ok?: boolean;
				status?: string;
				remindersRevision?: number;
			}>("/health", {method: "GET"});
			const ok = raw?.ok === true || raw?.status === "ok";
			return {
				ok,
				detail: ok ? "http" : raw?.status ?? "bridge unhealthy",
				remindersRevision: raw?.remindersRevision,
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {ok: false, detail: msg};
		}
	}

	async revision(): Promise<number> {
		try {
			const raw = await this.request<{revision?: number}>("/reminders/revision");
			if (typeof raw.revision === "number") return raw.revision;
		} catch {
			/* fall through to /health */
		}
		const health = await this.health();
		return health.remindersRevision ?? 0;
	}

	async lists(): Promise<ReminderListRow[]> {
		const raw = await this.request<{lists?: ReminderListRow[]} | ReminderListRow[]>(
			"/lists",
			{method: "GET"},
		);
		if (Array.isArray(raw)) return raw;
		return raw.lists ?? [];
	}

	fetchAllReminders(): Promise<FulcrumReminder[]> {
		return this.fetchReminders();
	}

	async fetchReminders(opts?: {listIds?: string[]; inbox?: boolean}): Promise<FulcrumReminder[]> {
		const q = new URLSearchParams();
		if (opts?.listIds?.length) q.set("listIds", opts.listIds.join(","));
		if (opts?.inbox) q.set("inbox", "true");
		const qs = q.toString();
		const raw = await this.request<{reminders?: unknown[]} | unknown[]>(
			`/reminders${qs ? `?${qs}` : ""}`,
			{method: "GET"},
		);
		const rows = Array.isArray(raw) ? raw : (raw.reminders ?? []);
		return rows.map(normalizeHttpReminder).filter((r): r is FulcrumReminder => r != null);
	}

	async get(id: string): Promise<FulcrumReminder> {
		const raw = await this.request<unknown>(`/reminders/${encodeURIComponent(id)}`);
		const rem = normalizeHttpReminder(raw);
		if (!rem) throw new Error(`Reminder not found: ${id}`);
		return rem;
	}

	complete(id: string): Promise<void> {
		return this.request(`/reminders/${encodeURIComponent(id)}/complete`, {method: "POST"});
	}

	reopen(id: string): Promise<void> {
		return this.request(`/reminders/${encodeURIComponent(id)}/reopen`, {method: "POST"});
	}

	async create(opts: CreateReminderOptions): Promise<string> {
		const raw = await this.request<{id?: string}>(
			"/reminders",
			{method: "POST", body: JSON.stringify(opts)},
		);
		const id = typeof raw.id === "string" ? raw.id.trim() : "";
		if (!id) throw new Error("Bridge did not return reminder id");
		return id;
	}

	update(id: string, patch: UpdateReminderOptions): Promise<void> {
		return this.editReminder(id, patch);
	}

	deleteReminder(id: string): Promise<void> {
		return this.request(`/reminders/${encodeURIComponent(id)}`, {method: "DELETE"});
	}

	editReminder(id: string, patch: UpdateReminderOptions): Promise<void> {
		return this.request(`/reminders/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify(patch),
		});
	}

	async listCreate(name: string, color?: {color: string; usePrivate: boolean}): Promise<string> {
		const raw = await this.request<{listId?: string; id?: string}>(
			"/lists",
			{
				method: "POST",
				body: JSON.stringify({
					name,
					color: color?.color,
				}),
			},
		);
		const id = raw.listId ?? raw.id;
		if (!id?.trim()) throw new Error("Bridge did not return list id");
		return id.trim();
	}

	listEdit(listId: string, opts: {color?: string; usePrivate?: boolean}): Promise<void> {
		return this.request(`/lists/${encodeURIComponent(listId)}`, {
			method: "PATCH",
			body: JSON.stringify({color: opts.color}),
		});
	}

	async calendars(): Promise<BridgeCalendarRow[]> {
		const raw = await this.request<{calendars?: BridgeCalendarRow[]} | BridgeCalendarRow[]>(
			"/calendars",
			{method: "GET"},
		);
		return Array.isArray(raw) ? raw : (raw.calendars ?? []);
	}

	async events(
		fromIso: string,
		toIso: string,
		calendarIds: string[],
	): Promise<BridgeCalendarEvent[]> {
		const params = new URLSearchParams({from: fromIso, to: toIso});
		for (const id of calendarIds) params.append("calendarId", id);
		const raw = await this.request<{events?: BridgeCalendarEvent[]} | BridgeCalendarEvent[]>(
			`/events?${params.toString()}`,
			{method: "GET"},
		);
		return Array.isArray(raw) ? raw : (raw.events ?? []);
	}
}

function asNonEmptyString(value: unknown): string | null {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}

export function normalizeHttpReminder(row: unknown): FulcrumReminder | null {
	if (!row || typeof row !== "object") return null;
	const r = row as Record<string, unknown>;
	const id = asNonEmptyString(r.id) ?? asNonEmptyString(r.numericId);
	if (!id) return null;
	return {
		id,
		title: typeof r.title === "string" ? r.title : "",
		completed: !!r.completed,
		dueDate: typeof r.dueDate === "string" ? r.dueDate : null,
		notes: typeof r.notes === "string" ? r.notes : "",
		listId: asNonEmptyString(r.listId) ?? undefined,
		listName: typeof r.listName === "string" ? r.listName : undefined,
		tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
		lastModified: typeof r.lastModified === "string" ? r.lastModified : undefined,
		externalId: asNonEmptyString(r.externalId) ?? undefined,
		recurring: !!r.recurring,
	};
}

export async function createRemindersBridge(settings: FulcrumSettings): Promise<RemindersBridge> {
	const url = settings.remindersBridgeUrl.trim() || "http://127.0.0.1:9247";
	const http = new HttpRemindersBridge(url, settings.remindersBridgeToken);
	if (!(await http.ping())) {
		throw new Error("Fulcrum Bridge is not reachable. Start Fulcrum Bridge, then try again.");
	}
	return http;
}
