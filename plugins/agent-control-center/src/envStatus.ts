import { existsSync, readFileSync } from "fs";

/** True only when the key is present and its value is non-empty. Values are never returned. */
export function parseEnvSetMap(raw: string): Map<string, boolean> {
	const map = new Map<string, boolean>();
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) continue;
		const value = match[2].replace(/^['"]|['"]$/g, "").trim();
		map.set(match[1], value.length > 0);
	}
	return map;
}

export function readEnvStatus(envPath: string): { exists: boolean; status: Map<string, boolean> } {
	if (!existsSync(envPath)) return { exists: false, status: new Map() };
	return { exists: true, status: parseEnvSetMap(readFileSync(envPath, "utf8")) };
}

export function missingEnvKeys(
	required: string[] | undefined,
	setMap: Map<string, boolean>,
): string[] {
	return (required ?? []).filter((key) => setMap.get(key) !== true);
}

export function missingKeyText(keys: string[]): string {
	if (keys.length === 1) return `${keys[0]} is empty`;
	return `${keys.join(", ")} are empty`;
}
