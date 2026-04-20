/** Use this exact name for your OAuth application at https://trakt.tv/oauth/applications */
export const TRAKT_OAUTH_APP_NAME = "Repose Media Tracker";

export const TRAKT_WEB_ORIGIN = "https://trakt.tv";

/** Public Trakt show page; numeric id redirects to the canonical slug URL. */
export function traktShowWebUrl(traktId: number): string {
	return `${TRAKT_WEB_ORIGIN}/shows/${traktId}`;
}
