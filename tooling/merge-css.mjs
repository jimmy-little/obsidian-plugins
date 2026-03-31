#!/usr/bin/env node
/**
 * Merges packages/theme/tokens.css + plugins/<name>/src/plugin.css + packages/theme/people.css
 * + packages/theme/shell.css → styles.css
 * Order: tokens → plugin → shared people UI → shell (shell last for suite overrides).
 * Run from plugin directory (cwd = plugin root).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const cwd = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tokensPath = join(root, "packages/theme/tokens.css");
const peoplePath = join(root, "packages/theme/people.css");
const shellPath = join(root, "packages/theme/shell.css");
const pluginCssPath = join(cwd, "src/plugin.css");

const tokens = readFileSync(tokensPath, "utf8");
const pluginCss = existsSync(pluginCssPath) ? readFileSync(pluginCssPath, "utf8") : "";
const people = existsSync(peoplePath) ? readFileSync(peoplePath, "utf8") : "";
const shell = existsSync(shellPath) ? readFileSync(shellPath, "utf8") : "";
const out = join(cwd, "styles.css");
writeFileSync(out, `${tokens}\n${pluginCss}\n${people}\n${shell}\n`);
console.log(`Wrote ${out}`);
