const STYLE_ID = "fulcrum-plugin-styles-injected";

/** Inject bundled plugin CSS (Obsidian also loads styles.css, but this guarantees it). */
export function injectFulcrumPluginStyles(css: string): () => void {
	if (typeof document === "undefined" || !css.trim()) {
		return () => {};
	}
	const existing = document.getElementById(STYLE_ID);
	if (existing instanceof HTMLStyleElement) {
		existing.textContent = css;
		return () => existing.remove();
	}
	const el = document.head.createEl("style", { attr: { id: STYLE_ID } });
	el.textContent = css;
	return () => el.remove();
}
