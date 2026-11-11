import {randomBytes, timingSafeEqual} from "crypto";
import {createServer, type IncomingMessage, type Server, type ServerResponse} from "http";
import {Notice, Platform, type App, type TFile} from "obsidian";
import {collectPeopleMarkdownFiles} from "./collectPeopleFiles";
import {
	applyRostrFields,
	normalizeRostrUrl,
	rostrUpdateHashUrl,
	rostrUrlsMatch,
	type RostrUpdateFields,
} from "./rostrUpdate";

const PORT_START = 47321;
const PORT_TRIES = 10;
const MAX_BODY = 256_000;

export type RostrBridgeHost = {
	app: App;
	settings: {peopleDirs: string[]};
	rostrBridgeToken: string;
	rostrBridge: RostrBridge | null;
	saveSettings(): Promise<void>;
};

export class RostrBridge {
	port = 0;
	private server: Server | null = null;
	private starting: Promise<void> | null = null;

	constructor(private readonly host: RostrBridgeHost) {}

	start(): Promise<void> {
		if (this.port && this.server) return Promise.resolve();
		if (!this.starting) {
			this.starting = this.listen().catch((err) => {
				this.starting = null;
				throw err;
			});
		}
		return this.starting;
	}

	stop(): void {
		this.server?.close();
		this.server = null;
		this.port = 0;
		this.starting = null;
	}

	updateUrl(rostrUrl: string): string {
		return rostrUpdateHashUrl(rostrUrl, this.host.rostrBridgeToken, this.port);
	}

	private async listen(): Promise<void> {
		if (!Platform.isDesktopApp) return;
		if (!this.host.rostrBridgeToken) {
			this.host.rostrBridgeToken = randomBytes(24).toString("hex");
			await this.host.saveSettings();
		}
		const token = this.host.rostrBridgeToken;
		let lastError: unknown;
		for (let i = 0; i < PORT_TRIES; i++) {
			const port = PORT_START + i;
			try {
				await this.bind(port, token);
				this.port = port;
				return;
			} catch (err) {
				lastError = err;
				const code = (err as NodeJS.ErrnoException).code;
				if (code !== "EADDRINUSE") throw err;
			}
		}
		throw lastError instanceof Error
			? lastError
			: new Error(`Rostr bridge could not bind ports ${PORT_START}–${PORT_START + PORT_TRIES - 1}.`);
	}

	private bind(port: number, token: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((req, res) => {
				void this.handle(req, res, token);
			});
			const onError = (err: Error) => reject(err);
			server.once("error", onError);
			server.listen(port, "127.0.0.1", () => {
				server.off("error", onError);
				server.on("error", (err) => console.error("Fulcrum Rostr bridge", err));
				this.server = server;
				resolve();
			});
		});
	}

	private async handle(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
		if (req.method !== "POST" || (req.url ?? "").split("?")[0] !== "/rostr-update") {
			sendJson(res, 404, {ok: false, error: "Not found."});
			return;
		}
		const header = req.headers["x-rostr-token"];
		const presented = Array.isArray(header) ? header[0] ?? "" : header ?? "";
		if (!tokensEqual(presented, token)) {
			sendJson(res, 401, {ok: false, error: "Rostr bridge token was rejected."});
			return;
		}
		let raw = "";
		try {
			raw = await readBody(req);
		} catch {
			sendJson(res, 413, {ok: false, error: "Update payload is too large."});
			return;
		}
		let parsed: {rostr?: unknown; fields?: RostrUpdateFields};
		try {
			parsed = JSON.parse(raw) as {rostr?: unknown; fields?: RostrUpdateFields};
		} catch {
			sendJson(res, 400, {ok: false, error: "Update payload was not JSON."});
			return;
		}
		const fields = parsed.fields;
		const canonical = normalizeRostrUrl(typeof parsed.rostr === "string" ? parsed.rostr : "");
		const name = fields && typeof fields.name === "string" ? fields.name.trim() : "";
		if (!canonical || !fields || !name) {
			sendJson(res, 400, {ok: false, error: "Rostr profile was incomplete."});
			return;
		}
		fields.rostr = canonical;
		fields.name = name;
		try {
			const paths = await applyToNotes(this.host, canonical, fields);
			if (!paths.length) {
				new Notice("No person note has this Rostr link.");
				sendJson(res, 404, {ok: false, error: "No person note has this Rostr link."});
				return;
			}
			new Notice(paths.length === 1 ? `Updated ${name} from Rostr.` : `Updated ${paths.length} notes from Rostr.`);
			sendJson(res, 200, {ok: true, name, paths});
		} catch (err) {
			console.error(err);
			const message = err instanceof Error ? err.message : "Could not update the note.";
			new Notice(message);
			sendJson(res, 500, {ok: false, error: message});
		}
	}
}

export async function openPersonRostrUpdate(host: RostrBridgeHost, file: TFile): Promise<void> {
	const rostr = host.app.metadataCache.getFileCache(file)?.frontmatter?.rostr;
	if (typeof rostr !== "string" || !normalizeRostrUrl(rostr)) {
		new Notice("This note has no rostr link.");
		return;
	}
	const bridge = host.rostrBridge;
	if (!bridge) {
		new Notice("Rostr bridge is not running. Reload Fulcrum.");
		return;
	}
	try {
		await bridge.start();
	} catch (err) {
		console.error(err);
		new Notice("Rostr bridge could not start. See the console.");
		return;
	}
	if (!bridge.port) {
		new Notice("Rostr update needs the desktop app.");
		return;
	}
	await openExternalUrl(bridge.updateUrl(rostr));
	new Notice("Opened Rostr. This note updates when the profile finishes loading.");
}

async function applyToNotes(host: RostrBridgeHost, canonical: string, fields: RostrUpdateFields): Promise<string[]> {
	const files = collectPeopleMarkdownFiles(host.app, host.settings.peopleDirs);
	const matches = files.filter((file) => {
		const raw = host.app.metadataCache.getFileCache(file)?.frontmatter?.rostr;
		return typeof raw === "string" && rostrUrlsMatch(raw, canonical);
	});
	for (const file of matches) {
		await host.app.fileManager.processFrontMatter(file, (fm) => {
			applyRostrFields(fm, fields);
		});
	}
	return matches.map((file) => file.path);
}

function tokensEqual(presented: string, expected: string): boolean {
	const a = Buffer.from(presented);
	const b = Buffer.from(expected);
	if (a.length === 0 || a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(new Error("too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	const json = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(json),
	});
	res.end(json);
}

async function openExternalUrl(url: string): Promise<void> {
	if (Platform.isDesktopApp) {
		const electron = require("electron") as {shell?: {openExternal?: (target: string) => Promise<void>}};
		if (electron.shell?.openExternal) {
			await electron.shell.openExternal(url);
			return;
		}
	}
	window.open(url);
}
