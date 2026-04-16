export interface ReposeSettings {
	/** Trakt OAuth app (from Trakt API applications) */
	traktClientId: string;
	traktClientSecret: string;
	/** TMDB API v3 key (images for posters / stills) */
	tmdbApiKey: string;
	/** Vault-relative root for imported media notes (was OBSIDIAN_VAULT_PATH + `90 Media`) */
	mediaRoot: string;
	moviesSubfolder: string;
	seriesSubfolder: string;
	/** Frontmatter `project` wikilink for shows/episodes */
	projectWikilink: string;
	/** OAuth tokens (stored after device auth) */
	traktAccessToken: string;
	traktRefreshToken: string;
	/** Epoch ms when access token expires */
	traktTokenExpiresAt: number;
}

export const DEFAULT_SETTINGS: ReposeSettings = {
	traktClientId: "",
	traktClientSecret: "",
	tmdbApiKey: "",
	mediaRoot: "90 Media",
	moviesSubfolder: "Movies",
	seriesSubfolder: "Series",
	projectWikilink: "[[Downtime]]",
	traktAccessToken: "",
	traktRefreshToken: "",
	traktTokenExpiresAt: 0,
};

export function normalizeSettings(raw: unknown): ReposeSettings {
	const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return {
		traktClientId: typeof o.traktClientId === "string" ? o.traktClientId : DEFAULT_SETTINGS.traktClientId,
		traktClientSecret:
			typeof o.traktClientSecret === "string" ? o.traktClientSecret : DEFAULT_SETTINGS.traktClientSecret,
		tmdbApiKey: typeof o.tmdbApiKey === "string" ? o.tmdbApiKey : DEFAULT_SETTINGS.tmdbApiKey,
		mediaRoot: typeof o.mediaRoot === "string" ? o.mediaRoot : DEFAULT_SETTINGS.mediaRoot,
		moviesSubfolder: typeof o.moviesSubfolder === "string" ? o.moviesSubfolder : DEFAULT_SETTINGS.moviesSubfolder,
		seriesSubfolder: typeof o.seriesSubfolder === "string" ? o.seriesSubfolder : DEFAULT_SETTINGS.seriesSubfolder,
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
