import type { MediaKind } from "./media";
import { MEDIA_KINDS } from "./media";

export type TypeMatchMode = "tag" | "folder" | "frontmatter";

export interface TypeMatchRule {
	mode: TypeMatchMode;
	/** Tag name (no #), folder path, or key:value for frontmatter */
	text: string;
}

export type OpenViewsIn = "main" | "sidebar";

export interface ReposeSettings {
	openViewsIn: OpenViewsIn;
	/** When type rule is tag or frontmatter, new notes go here unless folder rule supplies a path */
	defaultNewNoteFolder: string;
	/** The Movie Database API v3 key (for poster, banner, logo, thumb on shows & movies). */
	tmdbApiKey: string;
	typeRules: Record<MediaKind, TypeMatchRule>;
}

export const DEFAULT_TYPE_RULE = (): TypeMatchRule => ({
	mode: "tag",
	text: "",
});

export const DEFAULT_SETTINGS: ReposeSettings = {
	openViewsIn: "main",
	defaultNewNoteFolder: "",
	tmdbApiKey: "",
	typeRules: {
		show: { mode: "tag", text: "show" },
		movie: { mode: "tag", text: "movie" },
		book: { mode: "tag", text: "book" },
		podcast: { mode: "tag", text: "podcast" },
		game: { mode: "tag", text: "game" },
	},
};

export function normalizeLoadedSettings(raw: unknown): ReposeSettings {
	const base = DEFAULT_SETTINGS;
	if (!raw || typeof raw !== "object") return { ...base, typeRules: { ...base.typeRules } };
	const o = raw as Record<string, unknown>;
	const openViewsIn = o.openViewsIn === "sidebar" ? "sidebar" : "main";
	const defaultNewNoteFolder =
		typeof o.defaultNewNoteFolder === "string" ? o.defaultNewNoteFolder : "";
	const tmdbApiKey = typeof o.tmdbApiKey === "string" ? o.tmdbApiKey : "";
	const typeRules = { ...base.typeRules };
	const tr = o.typeRules;
	if (tr && typeof tr === "object") {
		for (const k of MEDIA_KINDS) {
			const r = (tr as Record<string, unknown>)[k];
			if (r && typeof r === "object") {
				const rr = r as Record<string, unknown>;
				const mode =
					rr.mode === "folder" || rr.mode === "frontmatter" ? rr.mode : "tag";
				const text = typeof rr.text === "string" ? rr.text : "";
				typeRules[k] = { mode, text };
			}
		}
	}
	return { openViewsIn, defaultNewNoteFolder, tmdbApiKey, typeRules };
}
