import type {RemctlListRow, RemctlReminderRow} from "./types";
import {
	formatRemctlNotFoundError,
	isRemctlENOENT,
	resolveRemctlBinary,
} from "./remctlPath";

type ExecFileAsync = (
	file: string,
	args: readonly string[],
	options: {timeout: number; maxBuffer: number; encoding: "utf8"},
) => Promise<{stdout: string}>;

function getExecFileAsync(): ExecFileAsync {
	const {execFile} = require("child_process") as typeof import("child_process");
	const {promisify} = require("util") as typeof import("util");
	return promisify(execFile) as ExecFileAsync;
}

export class RemctlClient {
	private readonly resolvedBinary: string;

	constructor(configuredPath: string) {
		this.resolvedBinary = resolveRemctlBinary(configuredPath);
	}

	get resolvedPath(): string {
		return this.resolvedBinary;
	}

	async run(args: string[], timeoutMs = 120_000): Promise<string> {
		const bin = this.resolvedBinary;
		try {
			const execFileAsync = getExecFileAsync();
			const {stdout} = await execFileAsync(bin, args, {
				timeout: timeoutMs,
				maxBuffer: 16 * 1024 * 1024,
				encoding: "utf8",
			});
			return stdout;
		} catch (e: unknown) {
			if (isRemctlENOENT(e)) {
				throw new Error(formatRemctlNotFoundError(this.resolvedBinary));
			}
			const err = e as {stderr?: string; message?: string};
			const detail = err.stderr?.trim() || err.message || String(e);
			throw new Error(`remctl ${args[0] ?? ""} failed: ${detail}`);
		}
	}

	async runJson<T>(args: string[]): Promise<T> {
		const out = await this.run([...args, "--json"]);
		const trimmed = out.trim();
		if (!trimmed) return {} as T;
		return JSON.parse(trimmed) as T;
	}

	async doctorForAgent(): Promise<{ok: boolean; raw: unknown}> {
		try {
			const raw = await this.runJson<Record<string, unknown>>(["doctor", "--for-agent"]);
			const ok = raw?.ok === true || raw?.status === "ok";
			return {ok, raw};
		} catch {
			return {ok: false, raw: null};
		}
	}

	async lists(): Promise<RemctlListRow[]> {
		const raw = await this.runJson<unknown>(["lists"]);
		return normalizeLists(raw);
	}

	async showList(listRef: {listId?: string; listName?: string}): Promise<RemctlReminderRow[]> {
		const args = ["show"];
		if (listRef.listId) args.push("--list-id", listRef.listId);
		else if (listRef.listName) args.push(listRef.listName);
		else throw new Error("showList requires listId or listName");
		const raw = await this.runJson<unknown>(args);
		const rows = normalizeReminders(raw);
		if (listRef.listId) {
			for (const row of rows) {
				if (!row.listId) row.listId = listRef.listId;
			}
		}
		if (listRef.listName) {
			for (const row of rows) {
				if (!row.listName) row.listName = listRef.listName;
			}
		}
		return rows;
	}

	async info(numericId: number): Promise<RemctlReminderRow | null> {
		const raw = await this.runJson<unknown>(["info", String(numericId)]);
		const rows = normalizeReminders(raw);
		return rows[0] ?? null;
	}

	async add(opts: {
		title: string;
		listId?: string;
		listName?: string;
		due?: string | null;
		notes?: string;
		tags?: string[];
	}): Promise<number> {
		const args = ["add", opts.title, "--json"];
		if (opts.listId) args.push("--list-id", opts.listId);
		else if (opts.listName) args.push("-l", opts.listName);
		if (opts.due) args.push("-d", opts.due);
		if (opts.notes) args.push("-n", opts.notes);
		if (opts.tags?.length) {
			args.push("-t", opts.tags.join(","));
			args.push("--private");
		}
		const raw = await this.runJson<Record<string, unknown>>(args);
		const id = pickNumericId(raw);
		if (id == null) throw new Error("remctl add did not return numericId");
		return id;
	}

	async edit(
		numericId: number,
		patch: {
			title?: string;
			due?: string | null;
			notes?: string;
			listId?: string;
			listName?: string;
			tags?: string[];
		},
	): Promise<void> {
		const args = ["edit", String(numericId), "--json"];
		if (patch.title != null) args.push("--title", patch.title);
		if (patch.due === null) args.push("-d", "clear");
		else if (patch.due) args.push("-d", patch.due);
		if (patch.notes != null) args.push("-n", patch.notes);
		if (patch.listId) args.push("--list-id", patch.listId);
		else if (patch.listName) args.push("-l", patch.listName);
		if (patch.tags?.length) {
			args.push("-t", patch.tags.join(","));
			args.push("--private");
		}
		await this.run(args);
	}

	async setDone(numericId: number, done: boolean): Promise<void> {
		await this.run([done ? "done" : "undone", String(numericId)]);
	}

	async deleteReminder(numericId: number): Promise<void> {
		await this.run(["delete", String(numericId)]);
	}

	async listCreate(
		name: string,
		color?: {color: string; usePrivate: boolean},
	): Promise<string> {
		const args = ["list-create", name, "--json"];
		if (color) {
			args.push("--color", color.color);
			if (color.usePrivate) args.push("--private");
		}
		const raw = await this.runJson<Record<string, unknown>>(args);
		const id = pickListId(raw);
		if (!id) throw new Error("remctl list-create did not return list id");
		return id;
	}

	async listEdit(
		listId: string,
		opts: {color?: string; usePrivate?: boolean},
	): Promise<void> {
		const args = ["list-edit", "--list-id", listId, "--json"];
		if (opts.color) {
			args.push("--color", opts.color);
			if (opts.usePrivate) args.push("--private");
		}
		await this.run(args);
	}

	async listRename(listId: string, newName: string): Promise<void> {
		await this.run(["list-rename", "--list-id", listId, "--new-name", newName]);
	}

	async listUnpin(listRef: {listId?: string; listName?: string}): Promise<void> {
		const args = ["list-unpin"];
		if (listRef.listId) args.push("--list-id", listRef.listId);
		else if (listRef.listName) args.push(listRef.listName);
		else throw new Error("listUnpin requires listId or listName");
		await this.run(args);
	}
}

function pickNumericId(raw: Record<string, unknown>): number | null {
	const candidates = [raw.numericId, raw.id, raw.reminderId];
	for (const c of candidates) {
		if (typeof c === "number" && Number.isFinite(c)) return Math.round(c);
		if (typeof c === "string" && /^\d+$/.test(c)) return Number.parseInt(c, 10);
	}
	return null;
}

function pickListId(raw: Record<string, unknown>): string | null {
	for (const k of ["listId", "list_id", "id"]) {
		const v = raw[k];
		if (typeof v === "string" && v.trim()) return v.trim();
		if (typeof v === "number") return String(v);
	}
	return null;
}

function normalizeLists(raw: unknown): RemctlListRow[] {
	if (Array.isArray(raw)) return raw.map(parseListRow).filter(Boolean) as RemctlListRow[];
	if (raw && typeof raw === "object") {
		const o = raw as Record<string, unknown>;
		if (Array.isArray(o.lists)) return o.lists.map(parseListRow).filter(Boolean) as RemctlListRow[];
	}
	return [];
}

function parseListRow(row: unknown): RemctlListRow | null {
	if (!row || typeof row !== "object") return null;
	const r = row as Record<string, unknown>;
	const name = String(r.name ?? r.title ?? "").trim();
	const id = String(r.listId ?? r.list_id ?? r.id ?? "").trim();
	if (!name || !id) return null;
	return {id, name};
}

function normalizeReminders(raw: unknown): RemctlReminderRow[] {
	if (Array.isArray(raw)) return raw.map(parseReminderRow).filter(Boolean) as RemctlReminderRow[];
	if (raw && typeof raw === "object") {
		const o = raw as Record<string, unknown>;
		for (const key of ["reminders", "items", "results"]) {
			if (Array.isArray(o[key])) {
				return (o[key] as unknown[]).map(parseReminderRow).filter(Boolean) as RemctlReminderRow[];
			}
		}
		const single = parseReminderRow(raw);
		return single ? [single] : [];
	}
	return [];
}

function parseReminderRow(row: unknown): RemctlReminderRow | null {
	if (!row || typeof row !== "object") return null;
	const r = row as Record<string, unknown>;
	const numericId = pickNumericId(r);
	if (numericId == null) return null;
	const title = String(r.title ?? r.name ?? "").trim();
	const completed = Boolean(r.completed ?? r.isCompleted ?? r.done);
	const dueDate = pickDue(r);
	const notes = String(r.notes ?? r.body ?? "").trim();
	const listId = r.listId != null ? String(r.listId) : r.list_id != null ? String(r.list_id) : undefined;
	const listName = r.listName != null ? String(r.listName) : r.list != null ? String(r.list) : undefined;
	const lastModified = String(
		r.lastModified ?? r.modified ?? r.updated ?? r.completionDate ?? "",
	).trim();
	return {
		numericId,
		title,
		completed,
		dueDate,
		notes,
		listId,
		listName,
		lastModified: lastModified || new Date(0).toISOString(),
	};
}

function pickDue(r: Record<string, unknown>): string | null {
	for (const k of ["dueDate", "due", "displayDate"]) {
		const v = r[k];
		if (typeof v === "string" && v.trim()) return v.trim();
	}
	return null;
}
