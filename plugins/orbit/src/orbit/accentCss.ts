/**
 * Resolve person `color:` (and named tokens) to a CSS color string.
 * Mirrors Fulcrum’s `resolveProjectAccentCss` so Orbit stays aligned without depending on Fulcrum.
 */
const NAMED: Record<string, string> = {
	charcoal: "#36454f",
	navy: "#1a237e",
	slate: "#546e7a",
	red: "#c0392b",
	orange: "#e67e22",
	yellow: "#f1c40f",
	green: "#27ae60",
	blue: "#2980b9",
	purple: "#8e44ad",
	pink: "#d63384",
	teal: "#00897b",
	coral: "#ff7f50",
	olive: "#708238",
	crimson: "#dc143c",
	violet: "#7b1fa2",
	sky: "#039be5",
	mint: "#26a69a",
	amber: "#ffb300",
	rust: "#b7410e",
	lavender: "#9575cd",
	sand: "#c2b280",
	gray: "#757575",
	grey: "#757575",
};

export function resolveOrbitAccentCss(raw: string | undefined | null, fallback: string): string {
	if (raw == null || !String(raw).trim()) return fallback;
	const t = String(raw).trim();
	if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return t;
	if (/^(rgb|hsl)a?\(/i.test(t)) return t;
	const key = t.toLowerCase();
	if (NAMED[key]) return NAMED[key];
	return t;
}
