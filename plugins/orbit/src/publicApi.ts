import type {App, TFile} from "obsidian";
import {ORBIT_PLUGIN_ID, VIEW_ORBIT_PERSON} from "./orbit/constants";

export type OrbitPluginLike = {
	openPersonFile: (file: TFile) => Promise<void>;
};

/**
 * Fulcrum / other plugins: detect Orbit without a hard dependency.
 * ```ts
 * const orbit = getOrbitPlugin(app);
 * if (orbit) await orbit.openPersonFile(file);
 * ```
 */
export function getOrbitPlugin(app: App): OrbitPluginLike | null {
	const plugins = (app as unknown as {plugins?: {plugins?: Record<string, unknown>}}).plugins?.plugins;
	const inst = plugins?.[ORBIT_PLUGIN_ID] as OrbitPluginLike | undefined;
	if (!inst || typeof inst.openPersonFile !== "function") return null;
	return inst;
}

export {ORBIT_PLUGIN_ID, VIEW_ORBIT_PERSON};
