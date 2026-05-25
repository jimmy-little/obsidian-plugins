/** Prefer white/light UI text on top of this solid hex background. */
export function preferLightForegroundOnAccentCss(css: string): boolean {
	const t = css.trim();
	if (t.startsWith("#")) {
		const hex = t.slice(1);
		const full =
			hex.length === 3
				? hex
						.split("")
						.map((c) => c + c)
						.join("")
				: hex.length >= 6
					? hex.slice(0, 6)
					: null;
		if (!full) return true;
		const r = parseInt(full.slice(0, 2), 16);
		const g = parseInt(full.slice(2, 4), 16);
		const b = parseInt(full.slice(4, 6), 16);
		if ([r, g, b].some((x) => Number.isNaN(x))) return true;
		const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		return lum < 0.5;
	}
	const rgbM = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (rgbM) {
		const r = Number(rgbM[1]);
		const g = Number(rgbM[2]);
		const b = Number(rgbM[3]);
		if ([r, g, b].every((x) => Number.isFinite(x))) {
			return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
		}
	}
	return true;
}
