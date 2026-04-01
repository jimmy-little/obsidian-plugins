#!/usr/bin/env node
/**
 * Copies built plugin files into the vault (no symlinks).
 * Usage: node tooling/install-to-vault.mjs <path-to-plugin-dir>
 *
 * Vault root (first match wins):
 *   - OBSIDIAN_VAULT_PATH environment variable
 *   - Monorepo root `.vault-path.local.json` — see README (gitignored)
 */
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function vaultFromLocalFile() {
	const p = join(repoRoot, ".vault-path.local.json");
	if (!existsSync(p)) return "";
	try {
		const raw = readFileSync(p, "utf8").trim();
		const data = JSON.parse(raw);
		if (typeof data === "string") return data.trim();
		if (data && typeof data === "object") {
			const v = data.vaultPath ?? data.path ?? data.OBSIDIAN_VAULT_PATH;
			if (typeof v === "string") return v.trim();
		}
	} catch {
		/* invalid JSON */
	}
	return "";
}

let vault = process.env.OBSIDIAN_VAULT_PATH?.trim() || vaultFromLocalFile();
if (!vault) {
	console.error(`Set OBSIDIAN_VAULT_PATH to your vault root, e.g.:

  export OBSIDIAN_VAULT_PATH="/path/to/your/vault"
  npm run build:install -w obsidian-plugin-fulcrum

Or create ${join(repoRoot, ".vault-path.local.json")} (gitignored):

  { "vaultPath": "/path/to/your/vault" }
`);
	process.exit(1);
}

const pluginDir = resolve(process.argv[2] || "");
if (!pluginDir || !existsSync(pluginDir)) {
	console.error("Usage: node tooling/install-to-vault.mjs <plugin-directory>");
	process.exit(1);
}

const manifestPath = join(pluginDir, "manifest.json");
if (!existsSync(manifestPath)) {
	console.error("No manifest.json in", pluginDir);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const id = manifest.id;
if (!id) {
	console.error("manifest.json missing id");
	process.exit(1);
}

const dest = join(vault, ".obsidian", "plugins", id);
mkdirSync(dest, { recursive: true });

const files = ["main.js", "manifest.json", "styles.css"];
for (const f of files) {
	const src = join(pluginDir, f);
	if (!existsSync(src)) {
		console.warn("Skip missing:", src);
		continue;
	}
	const out = join(dest, f);
	copyFileSync(src, out);
	console.log("Copied", f, "→", out);
}

console.log("Installed to", dest);
