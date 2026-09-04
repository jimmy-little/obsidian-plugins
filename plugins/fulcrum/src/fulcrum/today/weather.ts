import {requestUrl} from "obsidian";
import type {TodayWeatherUnits} from "../settingsDefaults";
import {
	locationLabelFromGeocode,
	parseOpenMeteoForecast,
	type OpenMeteoForecastJson,
	type WeatherForecast,
} from "./weatherParse";

export type {WeatherDay, WeatherForecast} from "./weatherParse";
export {parseOpenMeteoForecast, weatherLucideIcon} from "./weatherParse";

type CacheEntry = {at: number; data: WeatherForecast};
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

type GeocodeHit = {
	name?: string;
	latitude?: number;
	longitude?: number;
	admin1?: string;
	country?: string;
};

export async function fetchOpenMeteoWeather(
	query: string,
	units: TodayWeatherUnits,
): Promise<WeatherForecast | null> {
	const q = query.trim();
	if (!q) return null;
	const cacheKey = `${q.toLowerCase()}|${units}`;
	const hit = cache.get(cacheKey);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

	const geo = await requestUrl({
		url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
		method: "GET",
	});
	const geoJson = geo.json as {results?: GeocodeHit[]} | undefined;
	const place = geoJson?.results?.[0];
	if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
		return null;
	}

	const tempUnit = units === "celsius" ? "celsius" : "fahrenheit";
	const forecast = await requestUrl({
		url:
			`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
			`&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max` +
			`&temperature_unit=${tempUnit}&timezone=auto&forecast_days=7`,
		method: "GET",
	});
	const parsed = parseOpenMeteoForecast(
		forecast.json as OpenMeteoForecastJson,
		units,
		locationLabelFromGeocode(place, q),
	);
	if (!parsed) return null;
	cache.set(cacheKey, {at: Date.now(), data: parsed});
	return parsed;
}

export function clearWeatherCache(): void {
	cache.clear();
}
