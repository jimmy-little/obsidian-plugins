import type { App, Plugin } from "obsidian";

/** Obsidian runtime exposes plugins on App but it is not in the public API typings. */
type AppWithPlugins = App & {
	plugins: {
		enabledPlugins: Set<string>;
		plugins: Record<string, Plugin>;
	};
};

/** Manifest ids for obsidian-suite plugins (match manifest.json `id`). */
export const PLUGIN_IDS = {
	fulcrum: "fulcrum",
	pulse: "pulse",
	orbit: "orbit",
	ratchet: "ratchet",
	quill: "quill",
} as const;

export type SuitePluginId = (typeof PLUGIN_IDS)[keyof typeof PLUGIN_IDS];

function appPlugins(app: App): AppWithPlugins["plugins"] {
	return (app as AppWithPlugins).plugins;
}

export function isPluginEnabled(app: App, id: string): boolean {
	return appPlugins(app).enabledPlugins.has(id);
}

/** Returns the loaded plugin instance when enabled, otherwise null. */
export function getPluginApi<T extends Plugin = Plugin>(app: App, id: string): T | null {
	if (!isPluginEnabled(app, id)) return null;
	const plugin = appPlugins(app).plugins[id];
	return (plugin as T | undefined) ?? null;
}
