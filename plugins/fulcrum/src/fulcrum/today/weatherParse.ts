import type {TodayWeatherUnits} from "../settingsDefaults";

export type WeatherDay = {
	iso: string;
	weekday: string;
	high: number;
	code: number;
};

export type WeatherForecast = {
	currentTemp: number;
	currentCode: number;
	units: TodayWeatherUnits;
	locationLabel: string;
	days: WeatherDay[];
};

export type OpenMeteoForecastJson = {
	current?: {temperature_2m?: number; weather_code?: number};
	daily?: {
		time?: string[];
		weather_code?: number[];
		temperature_2m_max?: number[];
	};
};

export function weatherLucideIcon(code: number): string {
	if (code === 0 || code === 1) return "sun";
	if (code === 2) return "cloud-sun";
	if (code === 3 || code === 45 || code === 48) return "cloud";
	if (code >= 51 && code <= 67) return "cloud-rain";
	if (code >= 71 && code <= 77) return "cloud-snow";
	if (code >= 80 && code <= 82) return "cloud-rain";
	if (code >= 85 && code <= 86) return "cloud-snow";
	if (code >= 95) return "zap";
	return "cloud";
}

export function parseOpenMeteoForecast(
	json: OpenMeteoForecastJson,
	units: TodayWeatherUnits,
	locationLabel: string,
	now = new Date(),
): WeatherForecast | null {
	const currentTemp = json.current?.temperature_2m;
	const currentCode = json.current?.weather_code;
	const times = json.daily?.time ?? [];
	const highs = json.daily?.temperature_2m_max ?? [];
	const codes = json.daily?.weather_code ?? [];
	if (typeof currentTemp !== "number" || typeof currentCode !== "number") return null;

	const days: WeatherDay[] = [];
	for (let i = 0; i < times.length && days.length < 7; i++) {
		const iso = times[i];
		const high = highs[i];
		const code = codes[i];
		if (!iso || typeof high !== "number" || typeof code !== "number") continue;
		days.push({
			iso,
			weekday: weekdayShort(iso, now),
			high: Math.round(high),
			code,
		});
	}
	if (days.length === 0) return null;
	return {
		currentTemp: Math.round(currentTemp),
		currentCode,
		units,
		locationLabel,
		days,
	};
}

function weekdayShort(iso: string, now: Date): string {
	const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	if (iso === today) return "Today";
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso.slice(5);
	return new Intl.DateTimeFormat("en-US", {weekday: "short"}).format(d);
}

export function locationLabelFromGeocode(
	hit: {name?: string; admin1?: string},
	query: string,
): string {
	const name = hit.name?.trim() || query.trim();
	const region = hit.admin1?.trim();
	if (region && !name.toLowerCase().includes(region.toLowerCase())) return `${name}, ${region}`;
	return name;
}
