import {describe, expect, it} from "vitest";
import {parseOpenMeteoForecast, weatherLucideIcon} from "../weatherParse";

describe("weatherLucideIcon", () => {
	it("maps WMO codes to lucide names", () => {
		expect(weatherLucideIcon(0)).toBe("sun");
		expect(weatherLucideIcon(2)).toBe("cloud-sun");
		expect(weatherLucideIcon(61)).toBe("cloud-rain");
		expect(weatherLucideIcon(95)).toBe("zap");
	});
});

describe("parseOpenMeteoForecast", () => {
	it("reads current temp and daily highs", () => {
		const parsed = parseOpenMeteoForecast(
			{
				current: {temperature_2m: 82.4, weather_code: 0},
				daily: {
					time: ["2026-09-04", "2026-09-05"],
					temperature_2m_max: [88.2, 79.1],
					weather_code: [0, 2],
				},
			},
			"fahrenheit",
			"Washington",
			new Date("2026-09-04T12:00:00"),
		);
		expect(parsed?.currentTemp).toBe(82);
		expect(parsed?.days).toHaveLength(2);
		expect(parsed?.days[0]?.weekday).toBe("Today");
		expect(parsed?.days[1]?.high).toBe(79);
		expect(parsed?.locationLabel).toBe("Washington");
	});

	it("returns null without current conditions", () => {
		expect(
			parseOpenMeteoForecast({daily: {time: ["2026-09-04"], temperature_2m_max: [80], weather_code: [0]}}, "fahrenheit", "X"),
		).toBeNull();
	});
});
