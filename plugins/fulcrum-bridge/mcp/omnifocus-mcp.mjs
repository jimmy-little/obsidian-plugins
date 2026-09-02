#!/usr/bin/env node
/**
 * Stdio MCP server that proxies to Fulcrum Bridge OmniFocus HTTP API.
 * Same write path as the Fulcrum plugin — do not pair with a second OmniFocus MCP.
 *
 *   node plugins/fulcrum-bridge/mcp/omnifocus-mcp.mjs
 *
 * Env:
 *   FULCRUM_BRIDGE_URL   default http://127.0.0.1:9247
 *   FULCRUM_BRIDGE_TOKEN optional Bearer token
 */
"use strict";

const { stdin, stdout } = process;
const BASE = (process.env.FULCRUM_BRIDGE_URL || "http://127.0.0.1:9247").replace(/\/+$/, "");
const TOKEN = (process.env.FULCRUM_BRIDGE_TOKEN || "").trim();

const TOOLS = [
	{
		name: "omnifocus_health",
		description: "Check OmniFocus availability via Fulcrum Bridge (installed, running, OmniJS).",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "omnifocus_list_projects",
		description: "List OmniFocus projects.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "omnifocus_list_tasks",
		description: "List OmniFocus tasks. Filter by projectId, inbox, or completed (true/false/all).",
		inputSchema: {
			type: "object",
			properties: {
				projectId: { type: "string" },
				inbox: { type: "boolean" },
				completed: { type: "string", description: "true, false, or omit for all non-dropped" },
			},
		},
	},
	{
		name: "omnifocus_create_task",
		description: "Create an OmniFocus task (inbox unless projectId is set).",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string" },
				note: { type: "string" },
				due: { type: "string", description: "YYYY-MM-DD" },
				defer: { type: "string", description: "YYYY-MM-DD" },
				flagged: { type: "boolean" },
				projectId: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
			},
			required: ["name"],
		},
	},
	{
		name: "omnifocus_update_task",
		description: "Update an OmniFocus task by id (name, due, defer, completed, projectId, note, flagged).",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				name: { type: "string" },
				note: { type: "string" },
				due: { type: ["string", "null"] },
				defer: { type: ["string", "null"] },
				flagged: { type: "boolean" },
				completed: { type: "boolean" },
				projectId: { type: ["string", "null"] },
			},
			required: ["id"],
		},
	},
	{
		name: "omnifocus_create_project",
		description: "Create an OmniFocus project and return its id.",
		inputSchema: {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		},
	},
	{
		name: "omnifocus_sync",
		description: "Trigger OmniFocus sync via JXA Application.synchronize() so other devices pick up changes.",
		inputSchema: { type: "object", properties: {} },
	},
];

function headers() {
	const h = { "Content-Type": "application/json" };
	if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
	return h;
}

async function bridge(path, init = {}) {
	const res = await fetch(`${BASE}${path}`, {
		method: init.method || "GET",
		headers: headers(),
		body: init.body,
	});
	const text = await res.text();
	if (res.status === 204) return { ok: true, status: 204 };
	let json = text;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = { raw: text };
	}
	if (!res.ok) {
		const err = new Error(`Bridge ${path}: ${res.status} ${typeof json === "string" ? json : JSON.stringify(json)}`);
		err.status = res.status;
		throw err;
	}
	return json;
}

function textResult(obj) {
	return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function errorResult(message) {
	return { content: [{ type: "text", text: message }], isError: true };
}

async function callTool(name, args = {}) {
	switch (name) {
		case "omnifocus_health":
			return textResult(await bridge("/omnifocus/health"));
		case "omnifocus_list_projects":
			return textResult(await bridge("/omnifocus/projects"));
		case "omnifocus_list_tasks": {
			const q = new URLSearchParams();
			if (args.projectId) q.set("projectId", String(args.projectId));
			if (typeof args.inbox === "boolean") q.set("inbox", String(args.inbox));
			if (args.completed) q.set("completed", String(args.completed));
			const qs = q.toString();
			return textResult(await bridge(`/omnifocus/tasks${qs ? `?${qs}` : ""}`));
		}
		case "omnifocus_create_task": {
			const body = { ...args };
			delete body.id;
			return textResult(await bridge("/omnifocus/tasks", { method: "POST", body: JSON.stringify(body) }));
		}
		case "omnifocus_update_task": {
			const id = args.id;
			if (!id) throw new Error("id is required");
			const patch = { ...args };
			delete patch.id;
			await bridge(`/omnifocus/tasks/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify(patch),
			});
			return textResult({ ok: true, id });
		}
		case "omnifocus_create_project":
			return textResult(
				await bridge("/omnifocus/projects", {
					method: "POST",
					body: JSON.stringify({ name: args.name }),
				}),
			);
		case "omnifocus_sync":
			await bridge("/omnifocus/sync", { method: "POST" });
			return textResult({ ok: true });
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

function send(msg) {
	const json = JSON.stringify(msg);
	const buf = Buffer.from(json, "utf8");
	stdout.write(`Content-Length: ${buf.length}\r\n\r\n`);
	stdout.write(buf);
}

function reply(id, result) {
	send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
	send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
	if (!msg || msg.jsonrpc !== "2.0") return;
	if (msg.method && msg.id === undefined) return;
	const { id, method, params } = msg;
	try {
		if (method === "initialize") {
			reply(id, {
				protocolVersion: params?.protocolVersion || "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "fulcrum-omnifocus", version: "1.0.0" },
			});
			return;
		}
		if (method === "notifications/initialized") return;
		if (method === "ping") {
			reply(id, {});
			return;
		}
		if (method === "tools/list") {
			reply(id, { tools: TOOLS });
			return;
		}
		if (method === "tools/call") {
			const name = params?.name;
			const args = params?.arguments || {};
			try {
				const result = await callTool(name, args);
				reply(id, result);
			} catch (e) {
				reply(id, errorResult(e instanceof Error ? e.message : String(e)));
			}
			return;
		}
		replyError(id, -32601, `Method not found: ${method}`);
	} catch (e) {
		replyError(id, -32603, e instanceof Error ? e.message : String(e));
	}
}

let buffer = Buffer.alloc(0);
stdin.on("data", (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	while (true) {
		const headerEnd = buffer.indexOf("\r\n\r\n");
		if (headerEnd === -1) return;
		const header = buffer.slice(0, headerEnd).toString("utf8");
		const match = header.match(/Content-Length:\s*(\d+)/i);
		if (!match) {
			buffer = buffer.slice(headerEnd + 4);
			continue;
		}
		const len = Number(match[1]);
		const start = headerEnd + 4;
		if (buffer.length < start + len) return;
		const body = buffer.slice(start, start + len).toString("utf8");
		buffer = buffer.slice(start + len);
		try {
			void handle(JSON.parse(body));
		} catch (e) {
			process.stderr.write(`omnifocus-mcp parse error: ${e}\n`);
		}
	}
});

stdin.on("end", () => process.exit(0));
