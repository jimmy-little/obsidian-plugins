import {normalizeVaultRelPath} from "./paths";

/** Split user setting: one folder prefix per line or comma. */
export function parseFolderPrefixList(raw: string): string[] {
	const parts = raw.split(/[\n,]+/);
	const out: string[] = [];
	for (const p of parts) {
		const n = normalizeVaultRelPath(p);
		if (n) out.push(n);
	}
	return out;
}

/** True if file path is under any prefix, optionally `prefix/YYYY/...` like the Dataview template. */
export function isUnderAtomicPrefixes(
	filePath: string,
	prefixes: string[],
	year: string,
): boolean {
	for (const p of prefixes) {
		const withYear = `${p}/${year}`;
		if (filePath === withYear || filePath.startsWith(withYear + "/")) return true;
		if (filePath === p || filePath.startsWith(p + "/")) return true;
	}
	return false;
}
