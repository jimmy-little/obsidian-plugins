import { requestUrl } from "obsidian";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_BASE = "https://api.igdb.com/v4";

export type IgdbCover = { id?: number; image_id?: string };
export type IgdbScreenshot = { id?: number; image_id?: string };
export type IgdbGenre = { id?: number; name?: string };
export type IgdbPlatform = { id?: number; name?: string; abbreviation?: string };

export type IgdbGame = {
	id: number;
	name?: string;
	summary?: string;
	first_release_date?: number;
	rating?: number;
	total_rating?: number;
	/** IGDB game category enum (0 = main game, 8 = remake, 11 = port, …). */
	category?: number;
	cover?: IgdbCover | number;
	screenshots?: IgdbScreenshot[];
	genres?: IgdbGenre[] | number[];
	platforms?: IgdbPlatform[] | number[];
};

let tokenCache: { token: string; expiresAtMs: number } | null = null;

export function igdbImageUrl(
	imageId: string,
	size: "cover_small" | "cover_big" | "1080p" | "screenshot_huge",
): string {
	const id = imageId.replace(/\.(jpg|png)$/i, "");
	return `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;
}

function normalizeCover(game: IgdbGame): IgdbCover | null {
	const c = game.cover;
	if (c && typeof c === "object" && typeof c.image_id === "string") return c;
	return null;
}

function normalizeScreenshots(game: IgdbGame): IgdbScreenshot[] {
	const s = game.screenshots;
	if (!Array.isArray(s)) return [];
	return s.filter((x): x is IgdbScreenshot => x && typeof x === "object" && typeof x.image_id === "string");
}

export function normalizeGenres(game: IgdbGame): string[] {
	const g = game.genres;
	if (!Array.isArray(g)) return [];
	const names: string[] = [];
	for (const item of g) {
		if (item && typeof item === "object" && typeof (item as IgdbGenre).name === "string") {
			names.push((item as IgdbGenre).name!);
		}
	}
	return names;
}

/** Public URLs for art downloads (same roles as Trakt/TMDB poster + banner). */
function normalizePlatforms(game: IgdbGame): IgdbPlatform[] {
	const p = game.platforms;
	if (!Array.isArray(p)) return [];
	return p.filter((x): x is IgdbPlatform => x != null && typeof x === "object" && typeof x.name === "string");
}

/** IGDB category enum — see https://api-docs.igdb.com/#game-enums */
const IGDB_CATEGORY_LABEL: Record<number, string> = {
	1: "DLC",
	2: "Expansion",
	3: "Bundle",
	4: "Standalone expansion",
	5: "Mod",
	6: "Episode",
	7: "Season",
	8: "Remake",
	9: "Remaster",
	10: "Expanded game",
	11: "Port",
	12: "Fork",
};

function igdbCategoryLabel(category: unknown): string | null {
	if (category === undefined || category === null) return null;
	if (typeof category !== "number" || !Number.isFinite(category)) return null;
	if (category === 0) return null;
	return IGDB_CATEGORY_LABEL[category] ?? `Category ${category}`;
}

/** Release year from IGDB unix time (seconds), or null. */
export function igdbFirstReleaseYear(game: IgdbGame): string | null {
	const d = game.first_release_date;
	if (typeof d !== "number" || !Number.isFinite(d) || d <= 0) return null;
	return String(new Date(d * 1000).getUTCFullYear());
}

/** Comma-separated platform names, max `max` entries, sorted for stable display. */
export function igdbPlatformSummary(game: IgdbGame, max = 4): string | null {
	const names = normalizePlatforms(game)
		.map((p) => (typeof p.name === "string" ? p.name.trim() : ""))
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	if (names.length === 0) return null;
	const shown = names.slice(0, max);
	const extra = names.length - shown.length;
	return extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
}

/** Second line for match modals: year · platforms · type · id */
export function igdbGamePickMetaLine(game: IgdbGame): string {
	const bits: string[] = [];
	const y = igdbFirstReleaseYear(game);
	if (y) bits.push(y);
	const pl = igdbPlatformSummary(game, 4);
	if (pl) bits.push(pl);
	const cat = igdbCategoryLabel(game.category);
	if (cat) bits.push(cat);
	bits.push(`IGDB ${game.id}`);
	return bits.join(" · ");
}

/** Small cover URL for picker UI (faster than cover_big). */
export function igdbGamePickThumbUrl(game: IgdbGame): string | null {
	const cover = normalizeCover(game);
	return cover?.image_id ? igdbImageUrl(cover.image_id, "cover_small") : null;
}

export function artUrlsForIgdbGame(game: IgdbGame): { poster: string | null; banner: string | null } {
	const cover = normalizeCover(game);
	const poster = cover?.image_id ? igdbImageUrl(cover.image_id, "cover_big") : null;
	const shots = normalizeScreenshots(game);
	const first = shots[0]?.image_id;
	const banner = first ? igdbImageUrl(first, "1080p") : poster;
	return { poster, banner };
}

async function fetchAppAccessToken(clientId: string, clientSecret: string): Promise<{ access_token: string; expires_in: number }> {
	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: "client_credentials",
	}).toString();
	const res = await requestUrl({
		url: TWITCH_TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
		throw: false,
	});
	if (res.status >= 400) {
		throw new Error(`Twitch token HTTP ${res.status}: ${res.text?.slice(0, 200) ?? ""}`);
	}
	const json = JSON.parse(res.text) as { access_token?: string; expires_in?: number };
	if (!json.access_token) throw new Error("Twitch OAuth response missing access_token.");
	return { access_token: json.access_token, expires_in: json.expires_in ?? 3600 };
}

async function getBearerToken(clientId: string, clientSecret: string): Promise<string> {
	const now = Date.now();
	if (tokenCache && now < tokenCache.expiresAtMs - 120_000) {
		return tokenCache.token;
	}
	const t = await fetchAppAccessToken(clientId, clientSecret);
	tokenCache = {
		token: t.access_token,
		expiresAtMs: now + t.expires_in * 1000,
	};
	return t.access_token;
}

async function igdbPost(clientId: string, clientSecret: string, path: string, apicalypseBody: string): Promise<string> {
	const bearer = await getBearerToken(clientId, clientSecret);
	const res = await requestUrl({
		url: `${IGDB_BASE}${path}`,
		method: "POST",
		headers: {
			"Client-ID": clientId,
			Authorization: `Bearer ${bearer}`,
			Accept: "application/json",
			"Content-Type": "text/plain",
		},
		body: apicalypseBody,
		throw: false,
	});
	if (res.status >= 400) {
		throw new Error(`IGDB ${path} HTTP ${res.status}: ${res.text?.slice(0, 300) ?? ""}`);
	}
	return res.text;
}

export async function searchIgdbGames(
	clientId: string,
	clientSecret: string,
	query: string,
	limit = 20,
): Promise<IgdbGame[]> {
	const q = query.trim().replace(/"/g, '\\"');
	if (!q) return [];
	const body = [
		`search "${q}";`,
		"fields id,name,summary,first_release_date,rating,total_rating,category,cover.image_id,screenshots.image_id,genres.name,platforms.name;",
		`limit ${limit};`,
	].join("\n");
	const text = await igdbPost(clientId, clientSecret, "/games", body);
	const arr = JSON.parse(text) as unknown;
	return Array.isArray(arr) ? (arr as IgdbGame[]) : [];
}

export async function getIgdbGameById(clientId: string, clientSecret: string, id: number): Promise<IgdbGame | null> {
	const body = [
		`where id = ${id};`,
		"fields id,name,summary,first_release_date,rating,total_rating,category,cover.image_id,screenshots.image_id,genres.name,platforms.name;",
	].join("\n");
	const text = await igdbPost(clientId, clientSecret, "/games", body);
	const arr = JSON.parse(text) as IgdbGame[];
	return arr[0] ?? null;
}
