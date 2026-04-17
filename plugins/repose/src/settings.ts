import { normalizePath } from "obsidian";

export const RULE_MEDIA_TYPES = ["movie", "show", "podcast", "book", "game"] as const;
export type ReposeRuleMediaType = (typeof RULE_MEDIA_TYPES)[number];

export type MediaTypeRuleMode = "folder" | "tag" | "frontmatter";

export interface MediaTypeRule {
	mode: MediaTypeRuleMode;
	/** Folder: path under media root (e.g. Movies or Docs/Movies). Tag: e.g. #movie or movie. Frontmatter: key: value */
	value: string;
}

export interface ReposeSettings {
	/** Trakt OAuth app (from Trakt API applications) */
	traktClientId: string;
	traktClientSecret: string;
	/** TMDB API v3 key (images for posters / stills) */
	tmdbApiKey: string;
	/** Twitch developer app Client ID (IGDB API uses Twitch OAuth — register at dev.twitch.tv). */
	twitchClientId: string;
	/** Twitch app secret — used only to request an app access token for IGDB (stored in plugin data). */
	twitchClientSecret: string;
	/** Vault-relative root for imported media notes (was OBSIDIAN_VAULT_PATH + `90 Media`) */
	mediaRoot: string;
	/**
	 * When `type` / `mediaType` frontmatter is missing, these rules classify notes.
	 * Order: movie, show, podcast, book, game — first match wins.
	 */
	typeRules: Record<ReposeRuleMediaType, MediaTypeRule>;
	/** Frontmatter `project` wikilink for shows/episodes */
	projectWikilink: string;
	/** OAuth tokens (stored after device auth) */
	traktAccessToken: string;
	traktRefreshToken: string;
	/** Epoch ms when access token expires */
	traktTokenExpiresAt: number;
}

const DEFAULT_TYPE_RULES: Record<ReposeRuleMediaType, MediaTypeRule> = {
	movie: { mode: "folder", value: "Movies" },
	show: { mode: "folder", value: "Series" },
	podcast: { mode: "folder", value: "Podcasts" },
	book: { mode: "folder", value: "Books" },
	game: { mode: "folder", value: "Games" },
};

function cloneTypeRules(): Record<ReposeRuleMediaType, MediaTypeRule> {
	return {
		movie: { ...DEFAULT_TYPE_RULES.movie },
		show: { ...DEFAULT_TYPE_RULES.show },
		podcast: { ...DEFAULT_TYPE_RULES.podcast },
		book: { ...DEFAULT_TYPE_RULES.book },
		game: { ...DEFAULT_TYPE_RULES.game },
	};
}

function parseTypeRules(raw: unknown, legacyMovies: string, legacySeries: string): Record<ReposeRuleMediaType, MediaTypeRule> {
	const base = cloneTypeRules();
	const tr =
		raw && typeof raw === "object" ? (raw as Record<string, unknown>).typeRules : undefined;
	const hasSavedTypeRules = tr != null && typeof tr === "object";

	if (!hasSavedTypeRules) {
		if (legacyMovies.trim()) base.movie = { mode: "folder", value: legacyMovies.trim() };
		if (legacySeries.trim()) base.show = { mode: "folder", value: legacySeries.trim() };
		return base;
	}

	const rulesObj = tr as Record<string, unknown>;
	for (const k of Object.keys(base) as ReposeRuleMediaType[]) {
		const r = rulesObj[k];
		if (!r || typeof r !== "object") continue;
		const rec = r as Record<string, unknown>;
		const mode = rec.mode;
		const value = rec.value;
		if (mode === "folder" || mode === "tag" || mode === "frontmatter") {
			base[k] = {
				mode,
				value: typeof value === "string" ? value : base[k].value,
			};
		}
	}
	return base;
}

export const DEFAULT_SETTINGS: ReposeSettings = {
	traktClientId: "",
	traktClientSecret: "",
	tmdbApiKey: "",
	twitchClientId: "",
	twitchClientSecret: "",
	mediaRoot: "90 Media",
	typeRules: cloneTypeRules(),
	projectWikilink: "[[Downtime]]",
	traktAccessToken: "",
	traktRefreshToken: "",
	traktTokenExpiresAt: 0,
};

export function normalizeSettings(raw: unknown): ReposeSettings {
	const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const legacyMovies =
		typeof o.moviesSubfolder === "string" ? o.moviesSubfolder : DEFAULT_TYPE_RULES.movie.value;
	const legacySeries =
		typeof o.seriesSubfolder === "string" ? o.seriesSubfolder : DEFAULT_TYPE_RULES.show.value;

	return {
		traktClientId: typeof o.traktClientId === "string" ? o.traktClientId : DEFAULT_SETTINGS.traktClientId,
		traktClientSecret:
			typeof o.traktClientSecret === "string" ? o.traktClientSecret : DEFAULT_SETTINGS.traktClientSecret,
		tmdbApiKey: typeof o.tmdbApiKey === "string" ? o.tmdbApiKey : DEFAULT_SETTINGS.tmdbApiKey,
		twitchClientId: typeof o.twitchClientId === "string" ? o.twitchClientId : DEFAULT_SETTINGS.twitchClientId,
		twitchClientSecret:
			typeof o.twitchClientSecret === "string" ? o.twitchClientSecret : DEFAULT_SETTINGS.twitchClientSecret,
		mediaRoot: typeof o.mediaRoot === "string" ? o.mediaRoot : DEFAULT_SETTINGS.mediaRoot,
		typeRules: parseTypeRules(o, legacyMovies, legacySeries),
		projectWikilink:
			typeof o.projectWikilink === "string" ? o.projectWikilink : DEFAULT_SETTINGS.projectWikilink,
		traktAccessToken:
			typeof o.traktAccessToken === "string" ? o.traktAccessToken : DEFAULT_SETTINGS.traktAccessToken,
		traktRefreshToken:
			typeof o.traktRefreshToken === "string" ? o.traktRefreshToken : DEFAULT_SETTINGS.traktRefreshToken,
		traktTokenExpiresAt:
			typeof o.traktTokenExpiresAt === "number" ? o.traktTokenExpiresAt : DEFAULT_SETTINGS.traktTokenExpiresAt,
	};
}

/** Path segments (under media root) used when importing / resolving vault paths for a type. */
export function folderSegmentsForType(settings: ReposeSettings, kind: ReposeRuleMediaType): string[] {
	const rule = settings.typeRules[kind];
	if (rule.mode === "folder" && rule.value.trim()) {
		return normalizePath(rule.value.trim())
			.split("/")
			.filter(Boolean);
	}
	const fallback: Record<ReposeRuleMediaType, string> = {
		movie: "Movies",
		show: "Series",
		podcast: "Podcasts",
		book: "Books",
		game: "Games",
	};
	return [fallback[kind]];
}
