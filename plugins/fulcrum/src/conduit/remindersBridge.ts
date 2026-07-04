import {requestUrl} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {RemctlClient} from "./remctlClient";
import type {
	BridgeCalendarEvent,
	BridgeCalendarRow,
	CreateReminderOptions,
	FulcrumReminder,
	RemctlListRow,
	RemctlReminderRow,
} from "./types";

export interface RemindersBridge {
	health(): Promise<{ok: boolean; detail?: string}>;
	lists(): Promise<RemctlListRow[]>;
	fetchAllReminders(): Promise<FulcrumReminder[]>;
	complete(id: number): Promise<void>;
	reopen(id: number): Promise<void>;
	create(opts: CreateReminderOptions): Promise<number>;
	deleteReminder(id: number): Promise<void>;
	editReminder?(
		id: number,
		patch: {notes?: string; tags?: string[]},
	): Promise<void>;
	listCreate(name: string, color?: {color: string; usePrivate: boolean}): Promise<string>;
	listEdit(listId: string, opts: {color?: string; usePrivate?: boolean}): Promise<void>;
	calendars?(): Promise<BridgeCalendarRow[]>;
	events?(fromIso: string, toIso: string, calendarIds: string[]): Promise<BridgeCalendarEvent[]>;
}

export function rowToFulcrumReminder(row: RemctlReminderRow): FulcrumReminder {
	return {
		id: row.numericId,
		title: row.title,
		completed: row.completed,
		dueDate: row.dueDate,
		notes: row.notes,
		listId: row.listId,
		listName: row.listName,
		tags: row.tags ?? [],
		lastModified: row.lastModified,
	};
}

class RemctlBridge implements RemindersBridge {
	constructor(private readonly client: RemctlClient) {}

	async health(): Promise<{ok: boolean; detail?: string}> {
		const {ok} = await this.client.doctorForAgent();
		return {ok, detail: ok ? "remctl" : "remctl doctor failed"};
	}

	lists(): Promise<RemctlListRow[]> {
		return this.client.lists();
	}

	async fetchAllReminders(): Promise<FulcrumReminder[]> {
		const lists = await this.client.lists();
		const out: FulcrumReminder[] = [];
		for (const list of lists) {
			try {
				const rows = await this.client.showList({listId: list.id});
				for (const row of rows) {
					out.push(rowToFulcrumReminder(row));
				}
			} catch (e) {
				console.warn("Reminders bridge: show list failed", list.name, e);
			}
		}
		return out;
	}

	complete(id: number): Promise<void> {
		return this.client.setDone(id, true);
	}

	reopen(id: number): Promise<void> {
		return this.client.setDone(id, false);
	}

	create(opts: CreateReminderOptions): Promise<number> {
		return this.client.add({
			title: opts.title,
			listId: opts.listId,
			listName: opts.listName,
			due: opts.due ?? undefined,
			notes: opts.notes,
			tags: opts.tags,
		});
	}

	deleteReminder(id: number): Promise<void> {
		return this.client.deleteReminder(id);
	}

	editReminder(id: number, patch: {notes?: string; tags?: string[]}): Promise<void> {
		return this.client.edit(id, patch);
	}

	listCreate(name: string, color?: {color: string; usePrivate: boolean}): Promise<string> {
		return this.client.listCreate(name, color);
	}

	listEdit(listId: string, opts: {color?: string; usePrivate?: boolean}): Promise<void> {
		return this.client.listEdit(listId, opts);
	}
}

class HttpRemindersBridge implements RemindersBridge {
	constructor(
		private readonly baseUrl: string,
		private readonly token: string,
	) {}

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

	async health(): Promise<{ok: boolean; detail?: string}> {
		try {
			const raw = await this.request<{ok?: boolean; status?: string}>(
				"/health",
				{method: "GET"},
			);
			const ok = raw?.ok === true || raw?.status === "ok";
			return {ok, detail: "http"};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {ok: false, detail: msg};
		}
	}

	async lists(): Promise<RemctlListRow[]> {
		const raw = await this.request<{lists?: RemctlListRow[]} | RemctlListRow[]>(
			"/lists",
			{method: "GET"},
		);
		if (Array.isArray(raw)) return raw;
		return raw.lists ?? [];
	}

	async fetchAllReminders(): Promise<FulcrumReminder[]> {
		const raw = await this.request<{reminders?: FulcrumReminder[]} | FulcrumReminder[]>(
			"/reminders",
			{method: "GET"},
		);
		const rows = Array.isArray(raw) ? raw : (raw.reminders ?? []);
		return rows.map(normalizeHttpReminder);
	}

	complete(id: number): Promise<void> {
		return this.request(`/reminders/${id}/complete`, {method: "POST"});
	}

	reopen(id: number): Promise<void> {
		return this.request(`/reminders/${id}/reopen`, {method: "POST"});
	}

	async create(opts: CreateReminderOptions): Promise<number> {
		const raw = await this.request<{id?: number; numericId?: number}>(
			"/reminders",
			{method: "POST", body: JSON.stringify(opts)},
		);
		const id = raw.numericId ?? raw.id;
		if (id == null || !Number.isFinite(id)) throw new Error("Bridge did not return reminder id");
		return Math.round(id);
	}

	deleteReminder(id: number): Promise<void> {
		return this.request(`/reminders/${id}`, {method: "DELETE"});
	}

	editReminder(id: number, patch: {notes?: string; tags?: string[]}): Promise<void> {
		return this.request(`/reminders/${id}`, {
			method: "PATCH",
			body: JSON.stringify(patch),
		});
	}

	async listCreate(name: string, color?: {color: string; usePrivate: boolean}): Promise<string> {
		const raw = await this.request<{listId?: string; id?: string}>(
			"/lists",
			{method: "POST", body: JSON.stringify({name, color})},
		);
		const id = raw.listId ?? raw.id;
		if (!id?.trim()) throw new Error("Bridge did not return list id");
		return id.trim();
	}

	listEdit(listId: string, opts: {color?: string; usePrivate?: boolean}): Promise<void> {
		return this.request(`/lists/${encodeURIComponent(listId)}`, {
			method: "PATCH",
			body: JSON.stringify(opts),
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

function normalizeHttpReminder(row: FulcrumReminder & {numericId?: number}): FulcrumReminder {
	return {
		id: row.id ?? row.numericId ?? 0,
		title: row.title,
		completed: row.completed,
		dueDate: row.dueDate ?? null,
		notes: row.notes ?? "",
		listId: row.listId,
		listName: row.listName,
		tags: row.tags ?? [],
		lastModified: row.lastModified,
	};
}

export async function createRemindersBridge(settings: FulcrumSettings): Promise<RemindersBridge> {
	const url = settings.remindersBridgeUrl.trim();
	if (url) {
		const http = new HttpRemindersBridge(url, settings.remindersBridgeToken);
		if (await http.ping()) return http;
	}
	return createRemctlBridge(settings);
}

export function createRemctlBridge(settings: FulcrumSettings): RemindersBridge {
	return new RemctlBridge(new RemctlClient(settings.conduitRemctlPath));
}
