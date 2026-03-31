import { runPluginBuild } from "../../tooling/esbuild.plugin.mjs";
await runPluginBuild(import.meta.url);
