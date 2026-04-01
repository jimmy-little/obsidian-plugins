/** Normalize a vault-relative path segment for comparison (no leading/trailing slashes). */
export function normalizeVaultPath(p: string): string {
	return p
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

/** True if `filePath` equals `dir` or is under `dir/` as a folder prefix. */
export function filePathUnderDir(filePath: string, dir: string): boolean {
	const fp = normalizeVaultPath(filePath);
	const d = normalizeVaultPath(dir);
	if (!d) return true;
	/* Case-insensitive so settings like `people` match vault path `People/` (common on macOS). */
	const fpL = fp.toLowerCase();
	const dL = d.toLowerCase();
	return fpL === dL || fpL.startsWith(dL + "/");
}

export function isFileInPeopleDirs(filePath: string, peopleDirs: string[]): boolean {
	if (!peopleDirs.length) return false;
	return peopleDirs.some((d) => filePathUnderDir(filePath, d));
}
