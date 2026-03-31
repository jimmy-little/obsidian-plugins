#!/usr/bin/env node
/**
 * Merges packages/theme/tokens.css + plugins/<name>/src/plugin.css → styles.css
 * Run from plugin directory (cwd = plugin root).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const cwd = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tokensPath = join(root, "packages/theme/tokens.css");
const pluginCssPath = join(cwd, "src/plugin.css");

const tokens = readFileSync(tokensPath, "utf8");
const pluginCss = existsSync(pluginCssPath) ? readFileSync(pluginCssPath, "utf8") : "";
const out = join(cwd, "styles.css");
writeFileSync(out, `${tokens}\n${pluginCss}\n`);
console.log(`Wrote ${out}`);
