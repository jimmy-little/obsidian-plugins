/** Node builtins — lazy-loaded so Conduit does not break Fulcrum on mobile. */
function fsModule(): typeof import("fs") {
	return require("fs") as typeof import("fs");
}

function osModule(): typeof import("os") {
	return require("os") as typeof import("os");
}

function pathModule(): typeof import("path") {
	return require("path") as typeof import("path");
}

/** Expand leading `~/` for settings entered by hand. */
export function expandHomePath(p: string): string {
	const t = p.trim();
	if (t.startsWith("~/")) return pathModule().join(osModule().homedir(), t.slice(2));
	return t;
}

const CANDIDATE_BINS = (): string[] => {
	const home = osModule().homedir();
	return [
		pathModule().join(home, ".local/bin/remctl"),
		"/opt/homebrew/bin/remctl",
		"/usr/local/bin/remctl",
	];
};

/**
 * Resolve remctl for Obsidian (GUI apps often lack ~/.local/bin on PATH).
 * Uses configured path when it exists; otherwise scans common install locations.
 */
export function resolveRemctlBinary(configured: string): string {
	const {existsSync} = fsModule();
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
	const {existsSync} = fsModule();
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
