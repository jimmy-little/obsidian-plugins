export const HYO_PLUGIN_ID = "hyo";
export const HYO_RUN_EVENT = "hyo-run-command";

export function hyoIsLoaded(plugins: Record<string, unknown> | undefined): boolean {
	return Boolean(plugins?.[HYO_PLUGIN_ID]);
}

export function hyoRunDetail(prompt: string): { prompt: string } {
	return { prompt };
}
