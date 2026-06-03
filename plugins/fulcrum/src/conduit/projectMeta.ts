import type {IndexedProject} from "../fulcrum/types";
import {resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";

const NAMED_REMCTL_COLORS = new Set([
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
	"pink",
	"gray",
	"grey",
	"brown",
	"black",
	"white",
	"cyan",
	"mint",
	"teal",
	"navy",
	"slate",
]);

/** remctl list color: EventKit name, or --private with #RRGGBB. */
export function remctlListColorArgs(
	raw: string | undefined | null,
): {color: string; usePrivate: boolean} | null {
	if (!raw?.trim()) return null;
	const css = resolveProjectAccentCss(raw, "");
	if (!css || css.startsWith("var(")) return null;
	if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(css)) {
		const hex =
			css.length === 4
				? `#${css[1]}${css[1]}${css[2]}${css[2]}${css[3]}${css[3]}`
				: css;
		return {color: hex, usePrivate: true};
	}
	const token = raw.trim().toLowerCase();
	if (NAMED_REMCTL_COLORS.has(token)) return {color: token, usePrivate: false};
	if (NAMED_REMCTL_COLORS.has(css.toLowerCase())) {
		return {color: css.toLowerCase(), usePrivate: false};
	}
	return {color: css, usePrivate: true};
}

/** Tag safe for remctl -t (no commas). */
export function sanitizeRemctlTag(label: string): string {
	const t = label
		.trim()
		.replace(/,/g, " ")
		.replace(/\s+/g, " ")
		.slice(0, 80);
	return t.length > 0 ? t : "Area";
}

export function areaTagForProject(project: IndexedProject): string | null {
	const name =
		project.areaName?.trim() ||
		project.areaFiles[0]?.basename.replace(/\.md$/i, "") ||
		"";
	if (!name) return null;
	return sanitizeRemctlTag(name);
}
