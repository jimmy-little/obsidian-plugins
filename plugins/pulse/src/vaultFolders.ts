import type { Vault } from "obsidian";

/** Create nested vault folders; no-op if the path already exists (including races). */
export async function ensureVaultFolder(vault: Vault, folderPath: string): Promise<void> {
	const normalized = folderPath.replace(/^\/+|\/+$/g, "");
	if (!normalized) return;

	const parts = normalized.split("/");
	for (let i = 1; i <= parts.length; i++) {
		const sub = parts.slice(0, i).join("/");
		if (vault.getAbstractFileByPath(sub)) continue;
		try {
			await vault.createFolder(sub);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/already exists/i.test(msg)) {
				if (vault.getAbstractFileByPath(sub)) continue;
			}
			throw err;
		}
	}
}
