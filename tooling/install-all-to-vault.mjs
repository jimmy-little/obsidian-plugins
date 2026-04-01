#!/usr/bin/env node
/**
 * Build the whole monorepo, then copy every listed plugin into the vault (no symlinks).
 * Uses the same vault resolution as tooling/install-to-vault.mjs (OBSIDIAN_VAULT_PATH or .vault-path.local.json).
 *
 * Plugins (order matters for your mental model; each is built via the root `npm run build` first):
 *   Pulse, Lapse, Fulcrum, Conduit, Orbit, Journal (Quill — folder plugins/quill or legacy plugins/day-won).
 *
 * Usage:
 *   node tooling/install-all-to-vault.mjs
 *   node tooling/install-all-to-vault.mjs --skip-build     # only copy already-built artifacts
 *   node tooling/install-all-to-vault.mjs --fail-on-missing
 *
 * Environment:
 *   OBSIDIAN_VAULT_PATH=/path/to/vault
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installScript = join(repoRoot, "tooling", "install-to-vault.mjs");

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const failOnMissing = args.includes("--fail-on-missing");

/**
 * Each entry is either a single plugin dir under `plugins/`, or several dirs where the first
 * that exists is used (e.g. Quill vs Day Won during rename).
 */
const PLUGIN_SPECS = [
	["plugins/pulse"],
	["plugins/lapse"],
	["plugins/fulcrum"],
	["plugins/conduit"],
	["plugins/orbit"],
	["plugins/quill", "plugins/day-won"], // Journal: Quill preferred; Day Won until migrated
];

function resolvePluginDir(spec) {
	if (typeof spec === "string") return { rel: spec, abs: join(repoRoot, spec) };
	for (const rel of spec) {
		const abs = join(repoRoot, rel);
		if (existsSync(abs) && existsSync(join(abs, "manifest.json"))) {
			return { rel, abs };
		}
	}
	return null;
}

function runNpmBuild() {
	const r = spawnSync("npm", ["run", "build"], {
		cwd: repoRoot,
		stdio: "inherit",
		shell: true,
	});
	if (r.error) throw r.error;
	return r.status ?? 1;
}

if (!skipBuild) {
	console.log("→ npm run build (all workspaces)\n");
	const code = runNpmBuild();
	if (code !== 0) process.exit(code);
	console.log("");
}

const missing = [];

for (const spec of PLUGIN_SPECS) {
	const resolved = resolvePluginDir(spec);
	if (!resolved) {
		const label = Array.isArray(spec) ? spec.join(" | ") : spec;
		missing.push(label);
		console.warn(`⚠ Skip (not in repo yet): ${label}`);
		continue;
	}
	console.log(`→ Install ${resolved.rel}\n`);
	const r = spawnSync(process.execPath, [installScript, resolved.abs], {
		cwd: repoRoot,
		stdio: "inherit",
	});
	const code = r.status ?? 1;
	if (code !== 0) process.exit(code);
	console.log("");
}

if (failOnMissing && missing.length > 0) {
	console.error("Missing plugin folder(s):", missing.join(", "));
	process.exit(1);
}

console.log("Done.");
