import {existsSync} from "fs";
import {homedir} from "os";
import {join} from "path";

/** Expand leading `~/` for settings entered by hand. */
export function expandHomePath(p: string): string {
	const t = p.trim();
	if (t.startsWith("~/")) return join(homedir(), t.slice(2));
	return t;
}

const CANDIDATE_BINS = (): string[] => {
	const home = homedir();
	return [
		join(home, ".local/bin/remctl"),
		"/opt/homebrew/bin/remctl",
		"/usr/local/bin/remctl",
	];
};

/**
 * Resolve remctl for Obsidian (GUI apps often lack ~/.local/bin on PATH).
 * Uses configured path when it exists; otherwise scans common install locations.
 */
export function resolveRemctlBinary(configured: string): string {
	const expanded = expandHomePath(configured);
	if (expanded && expanded !== "remctl" && existsSync(expanded)) {
		return expanded;
	}
	for (const candidate of CANDIDATE_BINS()) {
		if (existsSync(candidate)) return candidate;
	}
	return expanded || "remctl";
}

export function findRemctlBinary(): string | null {
	for (const candidate of CANDIDATE_BINS()) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

export function formatRemctlNotFoundError(configured: string): string {
	const hint = findRemctlBinary();
	if (hint) {
		return `remctl not on Obsidian’s PATH. Set Fulcrum → Conduit → remctl path to:\n${hint}`;
	}
	return (
		"remctl not found. Install from https://github.com/viticci/remctl " +
		"(./install.sh --bootstrap), then set the full path in Fulcrum → Conduit settings."
	);
}

export function isRemctlENOENT(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return msg.includes("ENOENT") || msg.includes("spawn remctl");
}
