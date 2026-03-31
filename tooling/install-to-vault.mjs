#!/usr/bin/env node
/**
 * Copies built plugin files into the vault (no symlinks).
 * Usage: node tooling/install-to-vault.mjs <path-to-plugin-dir>
 * Env: OBSIDIAN_VAULT_PATH (required)
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { readFileSync } from "fs";

const vault = process.env.OBSIDIAN_VAULT_PATH?.trim();
if (!vault) {
	console.error("Set OBSIDIAN_VAULT_PATH to your vault root.");
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
