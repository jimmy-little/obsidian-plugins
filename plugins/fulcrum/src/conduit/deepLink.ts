import type {App} from "obsidian";

export function resolveVaultName(app: App, override: string): string {
	const o = override.trim();
	return o.length > 0 ? o : app.vault.getName();
}

/** Canonical link for Reminder notes (works on mobile without Fulcrum handler). */
export function buildObsidianOpenLink(
	app: App,
	vaultNameOverride: string,
	filePath: string,
): string {
	const vault = encodeURIComponent(resolveVaultName(app, vaultNameOverride));
	const file = encodeURIComponent(filePath);
	return `obsidian://open?vault=${vault}&file=${file}`;
}

export function buildFulcrumOpenTaskLink(
	app: App,
	vaultNameOverride: string,
	filePath: string,
): string {
	const vault = encodeURIComponent(resolveVaultName(app, vaultNameOverride));
	const path = encodeURIComponent(filePath);
	return `obsidian://fulcrum?action=open_task&vault=${vault}&path=${path}`;
}

export function formatReminderNotesBody(openLink: string): string {
	return `Open in Obsidian\n${openLink}`;
}

export function extractPathFromObsidianLink(link: string, vaultName: string): string | null {
	try {
		const u = new URL(link.trim());
		if (u.protocol !== "obsidian:") return null;
		const host = u.hostname || u.pathname.replace(/^\//, "");
		if (host === "open") {
			const v = u.searchParams.get("vault");
			const file = u.searchParams.get("file");
			if (!file) return null;
			if (v && v !== vaultName) return null;
			return decodeURIComponent(file);
		}
		if (host === "fulcrum" && u.searchParams.get("action") === "open_task") {
			const v = u.searchParams.get("vault");
			const path = u.searchParams.get("path");
			if (!path) return null;
			if (v && v !== vaultName) return null;
			return decodeURIComponent(path);
		}
	} catch {
		return null;
	}
	return null;
}
