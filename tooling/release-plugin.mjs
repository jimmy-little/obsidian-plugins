#!/usr/bin/env node
/**
 * Per-plugin release in monorepo: bump version, build, commit, tag, push, gh release.
 * Tag format: <plugin-id>-v<semver> to avoid collisions.
 *
 * Usage (from monorepo root):
 *   node tooling/release-plugin.mjs plugins/pulse 0.0.2
 *   node tooling/release-plugin.mjs plugins/pulse 0.0.2 --force
 *
 * Requires: gh (GitHub CLI), git, clean tree unless --force
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const args = process.argv.slice(2).filter((a) => a !== "--force");
const force = process.argv.includes("--force");
const pluginRel = (args[0] || "").trim();
const newVersion = (args[1] || "").trim();

if (!pluginRel || !newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
	console.error("Usage: node tooling/release-plugin.mjs <plugin-dir> <version> [--force]");
	console.error("Example: node tooling/release-plugin.mjs plugins/pulse 0.0.2");
	process.exit(1);
}

const pluginRoot = resolve(root, pluginRel);

function run(cmd, opts = {}) {
	console.log(`$ ${cmd}`);
	return execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

if (!force) {
	const status = execSync("git status --porcelain", { encoding: "utf8", cwd: root });
	if (status.trim()) {
		console.error("Working tree is not clean. Commit or stash, or use --force.");
		process.exit(1);
	}
}

const pkgPath = join(pluginRoot, "package.json");
const manifestPath = join(pluginRoot, "manifest.json");
const versionsPath = join(pluginRoot, "versions.json");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const pluginId = manifest.id;
const tag = `${pluginId}-v${newVersion}`;

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const { minAppVersion } = manifest;
manifest.version = newVersion;
writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t"));

const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
versions[newVersion] = minAppVersion;
writeFileSync(versionsPath, JSON.stringify(versions, null, "\t"));

run(`npm run build --prefix "${pluginRoot}"`);

const rel = pluginRel.replace(/\\/g, "/");
run(`git add "${rel}/package.json" "${rel}/manifest.json" "${rel}/versions.json"`);
if (existsSync(join(pluginRoot, "styles.css"))) run(`git add "${rel}/styles.css"`);
run(`git add -f "${rel}/main.js"`);
run(`git commit -m "Release ${tag}"`);
run(`git tag ${tag}`);
run("git push");
run("git push origin --tags");

const assets = [
	join(pluginRoot, "main.js"),
	join(pluginRoot, "manifest.json"),
];
if (existsSync(join(pluginRoot, "styles.css"))) assets.push(join(pluginRoot, "styles.css"));

const assetArgs = assets.map((a) => `"${a}"`).join(" ");
run(`gh release create ${tag} ${assetArgs} --title "${tag}" --notes "Release ${tag}"`);
console.log("\nDone:", tag);
