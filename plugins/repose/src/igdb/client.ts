import { requestUrl } from "obsidian";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_BASE = "https://api.igdb.com/v4";

export type IgdbCover = { id?: number; image_id?: string };
export type IgdbScreenshot = { id?: number; image_id?: string };
export type IgdbGenre = { id?: number; name?: string };

export type IgdbGame = {
	id: number;
	name?: string;
	summary?: string;
	first_release_date?: number;
	rating?: number;
	total_rating?: number;
	cover?: IgdbCover | number;
	screenshots?: IgdbScreenshot[];
	genres?: IgdbGenre[] | number[];
};

let tokenCache: { token: string; expiresAtMs: number } | null = null;

export function igdbImageUrl(imageId: string, size: "cover_big" | "1080p" | "screenshot_huge"): string {
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
		"fields id,name,summary,first_release_date,rating,total_rating,cover.image_id,screenshots.image_id,genres.name;",
		`limit ${limit};`,
	].join("\n");
	const text = await igdbPost(clientId, clientSecret, "/games", body);
	const arr = JSON.parse(text) as unknown;
	return Array.isArray(arr) ? (arr as IgdbGame[]) : [];
}

export async function getIgdbGameById(clientId: string, clientSecret: string, id: number): Promise<IgdbGame | null> {
	const body = [`where id = ${id};`, "fields id,name,summary,first_release_date,rating,total_rating,cover.image_id,screenshots.image_id,genres.name;"].join(
		"\n",
	);
	const text = await igdbPost(clientId, clientSecret, "/games", body);
	const arr = JSON.parse(text) as IgdbGame[];
	return arr[0] ?? null;
}
