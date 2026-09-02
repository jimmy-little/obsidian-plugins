import {requestUrl} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {
	OmniFocusCreateTask,
	OmniFocusHealth,
	OmniFocusProject,
	OmniFocusTask,
	OmniFocusUpdateTask,
} from "./types";

export class OmniFocusClient {
	constructor(
		private readonly baseUrl: string,
		private readonly token: string,
	) {}

	static fromSettings(settings: FulcrumSettings): OmniFocusClient {
		const url = settings.omnifocusBridgeUrl.trim() || settings.remindersBridgeUrl.trim()
			|| "http://127.0.0.1:9247";
		return new OmniFocusClient(url, settings.remindersBridgeToken);
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
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`OmniFocus ${path}: ${res.status} ${res.text}`.trim());
		}
		if (res.status === 204) return undefined as T;
		return res.json as T;
	}

	async health(): Promise<OmniFocusHealth> {
		const raw = await this.request<{omnifocus?: OmniFocusHealth}>("/health");
		return (
			raw.omnifocus ?? {
				ok: false,
				status: "unknown",
				installed: false,
				running: false,
				automationOk: false,
				message: "Bridge did not report OmniFocus status",
			}
		);
	}

	async projects(): Promise<OmniFocusProject[]> {
		const raw = await this.request<{projects?: OmniFocusProject[]}>("/omnifocus/projects");
		return raw.projects ?? [];
	}

	async tasks(opts?: {
		projectId?: string;
		projectIds?: string[];
		inbox?: boolean;
		completed?: "true" | "false";
	}): Promise<OmniFocusTask[]> {
		const q = new URLSearchParams();
		if (opts?.projectId) q.set("projectId", opts.projectId);
		if (opts?.projectIds?.length) q.set("projectIds", opts.projectIds.join(","));
		if (typeof opts?.inbox === "boolean") q.set("inbox", String(opts.inbox));
		if (opts?.completed) q.set("completed", opts.completed);
		const qs = q.toString();
		const raw = await this.request<{tasks?: OmniFocusTask[]}>(
			`/omnifocus/tasks${qs ? `?${qs}` : ""}`,
		);
		return raw.tasks ?? [];
	}

	async createTask(body: OmniFocusCreateTask): Promise<string> {
		const raw = await this.request<{id?: string}>("/omnifocus/tasks", {
			method: "POST",
			body: JSON.stringify(body),
		});
		if (!raw.id) throw new Error("OmniFocus create task returned no id");
		return raw.id;
	}

	async updateTask(id: string, body: OmniFocusUpdateTask): Promise<void> {
		await this.request(`/omnifocus/tasks/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify(body),
		});
	}

	async createProject(name: string): Promise<string> {
		const raw = await this.request<{id?: string}>("/omnifocus/projects", {
			method: "POST",
			body: JSON.stringify({name}),
		});
		if (!raw.id) throw new Error("OmniFocus create project returned no id");
		return raw.id;
	}

	async synchronize(): Promise<void> {
		await this.request("/omnifocus/sync", {method: "POST"});
	}
}
