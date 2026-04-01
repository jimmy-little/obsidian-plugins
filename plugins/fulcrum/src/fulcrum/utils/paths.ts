import {normalizePath, TFolder, type Vault} from "obsidian";

/** Trim, strip leading slashes, strip trailing slashes — matches Obsidian vault-relative paths. */
export function normalizeVaultRelPath(folder: string): string {
	let f = folder.trim().replace(/^\/+/, "");
	while (f.endsWith("/")) {
		f = f.slice(0, -1);
	}
	return f;
}

/** True if `filePath` is exactly `folder` or under it. */
export function isUnderFolder(filePath: string, folder: string): boolean {
	const f = normalizeVaultRelPath(folder);
	if (!f) return true;
	const p = filePath.replace(/^\/+/, "");
	if (p === f) return true;
	return p.startsWith(f + "/");
}

/**
 * When projects live in `root/StatusName/...`, returns that status segment (lowercased).
 * Files directly in `root` (not in a subfolder) → `"active"`.
 */
export function projectStatusFromSubfolderLayout(filePath: string, root: string): string {
	const r = normalizeVaultRelPath(root);
	const p = filePath.replace(/^\/+/, "");
	if (!r || !p.startsWith(r + "/")) return "active";
	const rel = p.slice(r.length + 1);
	const parts = rel.split("/").filter(Boolean);
	if (parts.length < 2) return "active";
	return parts[0]!.toLowerCase();
}

/**
 * Returns the names of immediate subfolders under the given folder path.
 * Used when projectStatusIndication is "subfolder" to derive status options from folder structure.
 */
export function getImmediateSubfolderNames(vault: Vault, folderPath: string): string[] {
	const norm = normalizePath(folderPath.trim());
	if (!norm) return [];
	const folder = vault.getAbstractFileByPath(norm);
	if (!(folder && "children" in folder)) return [];
	const parent = folder as TFolder;
	const names: string[] = [];
	for (const child of parent.children) {
		if (child instanceof TFolder) {
			names.push(child.name);
		}
	}
	return names.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
}
