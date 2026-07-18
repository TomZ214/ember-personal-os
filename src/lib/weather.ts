/**
 * Weather data layer — Open-Meteo (no API key). One fetch pulls current
 * conditions, 48 h hourly and 10-day daily plus air quality; results are
 * cached in sessionStorage for 20 minutes per location.
 */

export interface HourPoint {
  time: string;
  temp: number;
  code: number;
  isDay: boolean;
  precipProb: number;
}

export interface DayPoint {
  date: string;
  code: number;
  hi: number;
  lo: number;
  sunrise: string;
  sunset: string;
  uv: number;
  precipProb: number;
  windMax: number;
}

export interface WeatherData {
  fetchedAt: number;
  current: {
    temp: number;
    feels: number;
    code: number;
    isDay: boolean;
    humidity: number;
    wind: number;
    windDir: number;
    gust: number;
    pressure: number;
    visibility: number; // km
    uv: number;
    precipProb: number;
    aqi: number | null;
    pm25: number | null;
  };
  hourly: HourPoint[];
  daily: DayPoint[];
  todayHi: number;
  todayLo: number;
}

const FORECAST =
  "https://api.open-meteo.com/v1/forecast?latitude=LAT&longitude=LON&timezone=auto&forecast_days=10" +
  "&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,precipitation" +
  "&hourly=temperature_2m,weather_code,is_day,precipitation_probability,visibility,uv_index" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,wind_speed_10m_max";

const AIR =
  "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=LAT&longitude=LON&current=us_aqi,pm2_5&timezone=auto";

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const key = `ember-wx2-${lat}-${lon}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const data = JSON.parse(cached) as WeatherData;
      if (Date.now() - data.fetchedAt < 20 * 60_000) return data;
    }
  } catch {
    /* ignore cache misses */
  }

  const sub = (u: string) => u.replace("LAT", String(lat)).replace("LON", String(lon));
  const [fRes, aRes] = await Promise.all([
    fetch(sub(FORECAST)).then((r) => r.json()),
    fetch(sub(AIR)).then((r) => r.json()).catch(() => null),
  ]);

  // hourly: keep the next 48 hours starting from the current hour
  const now = Date.now();
  const hAll: HourPoint[] = (fRes.hourly.time as string[]).map((time, i) => ({
    time,
    temp: Math.round(fRes.hourly.temperature_2m[i]),
    code: fRes.hourly.weather_code[i],
    isDay: fRes.hourly.is_day[i] === 1,
    precipProb: fRes.hourly.precipitation_probability?.[i] ?? 0,
  }));
  const startIdx = Math.max(0, hAll.findIndex((h) => new Date(h.time).getTime() >= now - 3_600_000));
  const hourly = hAll.slice(startIdx, startIdx + 48);

  // visibility & uv for "current" come from the current hour of the hourly arrays
  const curHourIdx = Math.max(0, (fRes.hourly.time as string[]).findIndex((t) => new Date(t).getTime() >= now - 3_600_000));
  const visibility = Math.round(((fRes.hourly.visibility?.[curHourIdx] ?? 10000) / 1000) * 10) / 10;
  const uv = Math.round(fRes.hourly.uv_index?.[curHourIdx] ?? 0);

  const daily: DayPoint[] = (fRes.daily.time as string[]).map((date, i) => ({
    date,
    code: fRes.daily.weather_code[i],
    hi: Math.round(fRes.daily.temperature_2m_max[i]),
    lo: Math.round(fRes.daily.temperature_2m_min[i]),
    sunrise: fRes.daily.sunrise[i],
    sunset: fRes.daily.sunset[i],
    uv: Math.round(fRes.daily.uv_index_max?.[i] ?? 0),
    precipProb: fRes.daily.precipitation_probability_max?.[i] ?? 0,
    windMax: Math.round(fRes.daily.wind_speed_10m_max?.[i] ?? 0),
  }));

  const data: WeatherData = {
    fetchedAt: Date.now(),
    current: {
      temp: Math.round(fRes.current.temperature_2m),
      feels: Math.round(fRes.current.apparent_temperature),
      code: fRes.current.weather_code,
      isDay: fRes.current.is_day === 1,
      humidity: Math.round(fRes.current.relative_humidity_2m),
      wind: Math.round(fRes.current.wind_speed_10m),
      windDir: Math.round(fRes.current.wind_direction_10m),
      gust: Math.round(fRes.current.wind_gusts_10m ?? 0),
      pressure: Math.round(fRes.current.surface_pressure),
      visibility,
      uv,
      precipProb: daily[0]?.precipProb ?? 0,
      aqi: aRes?.current?.us_aqi ?? null,
      pm25: aRes?.current?.pm2_5 != null ? Math.round(aRes.current.pm2_5) : null,
    },
    hourly,
    daily,
    todayHi: daily[0]?.hi ?? Math.round(fRes.current.temperature_2m),
    todayLo: daily[0]?.lo ?? Math.round(fRes.current.temperature_2m),
  };

  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* storage full — fine */
  }
  return data;
}

/* ---------------- place search (geocoding) ---------------- */

export interface PlaceHit {
  id: number;
  /** city / town name in the requested language */
  name: string;
  country: string;
  countryCode: string;
  /** state / region, when the API knows one */
  admin1?: string;
  latitude: number;
  longitude: number;
}

interface GeoResult {
  id: number;
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

/**
 * Look up a place by name via Open-Meteo's geocoding API (no key, same family
 * as the forecast endpoint). Results come back localized where possible.
 */
export async function searchPlaces(
  query: string,
  lang: WxLang = "en",
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=6&language=${lang}&format=json`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("geocoding failed");
  const data = (await res.json()) as { results?: GeoResult[] };

  return (data.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country ?? "",
    countryCode: r.country_code ?? "",
    admin1: r.admin1,
    latitude: Math.round(r.latitude * 100) / 100,
    longitude: Math.round(r.longitude * 100) / 100,
  }));
}

/** ISO-3166 alpha-2 → flag emoji, for a bit of colour in the results list. */
export function flagFor(countryCode: string): string {
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return "";
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/* ---------------- helpers ---------------- */

export type Condition =
  | "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "showers" | "thunder";

export function condition(code: number): Condition {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow";
  return "thunder";
}

type WxLang = "en" | "de";

export function conditionLabel(code: number, lang: WxLang = "en"): string {
  const en: Record<Condition, string> = {
    clear: "Clear", partly: "Partly cloudy", cloudy: "Overcast", fog: "Fog",
    drizzle: "Drizzle", rain: "Rain", snow: "Snow", showers: "Showers", thunder: "Thunderstorm",
  };
  const de: Record<Condition, string> = {
    clear: "Klar", partly: "Teils bewölkt", cloudy: "Bedeckt", fog: "Nebel",
    drizzle: "Nieselregen", rain: "Regen", snow: "Schnee", showers: "Schauer", thunder: "Gewitter",
  };
  return (lang === "de" ? de : en)[condition(code)];
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function windCompass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

/** US AQI → label + token color */
export function aqiMeta(aqi: number | null, lang: WxLang = "en"): { label: string; color: string } {
  const de = lang === "de";
  if (aqi === null) return { label: "—", color: "var(--faint)" };
  if (aqi <= 50) return { label: de ? "Gut" : "Good", color: "var(--success)" };
  if (aqi <= 100) return { label: de ? "Mäßig" : "Moderate", color: "var(--c-amber)" };
  if (aqi <= 150) return { label: de ? "Ungesund (empfindlich)" : "Unhealthy (sensitive)", color: "var(--warning)" };
  if (aqi <= 200) return { label: de ? "Ungesund" : "Unhealthy", color: "var(--danger)" };
  if (aqi <= 300) return { label: de ? "Sehr ungesund" : "Very unhealthy", color: "var(--c-lilac)" };
  return { label: de ? "Gefährlich" : "Hazardous", color: "var(--c-rose)" };
}

export function uvMeta(uv: number, lang: WxLang = "en"): { label: string; color: string } {
  const de = lang === "de";
  if (uv <= 2) return { label: de ? "Niedrig" : "Low", color: "var(--success)" };
  if (uv <= 5) return { label: de ? "Mäßig" : "Moderate", color: "var(--c-amber)" };
  if (uv <= 7) return { label: de ? "Hoch" : "High", color: "var(--warning)" };
  if (uv <= 10) return { label: de ? "Sehr hoch" : "Very high", color: "var(--danger)" };
  return { label: de ? "Extrem" : "Extreme", color: "var(--c-lilac)" };
}

/** approximate moon phase (0=new, 0.5=full) with a friendly name + emoji */
export function moonPhase(date = new Date(), lang: WxLang = "en"): { name: string; emoji: string; fraction: number } {
  // days since a known new moon (2000-01-06 18:14 UTC)
  const synodic = 29.53058867;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14) / 86_400_000;
  const days = date.getTime() / 86_400_000 - knownNew;
  const frac = ((days % synodic) + synodic) % synodic / synodic;
  const de = lang === "de";
  const phases: { max: number; en: string; de: string; emoji: string }[] = [
    { max: 0.03, en: "New moon", de: "Neumond", emoji: "🌑" },
    { max: 0.22, en: "Waxing crescent", de: "Zunehmende Sichel", emoji: "🌒" },
    { max: 0.28, en: "First quarter", de: "Erstes Viertel", emoji: "🌓" },
    { max: 0.47, en: "Waxing gibbous", de: "Zunehmender Mond", emoji: "🌔" },
    { max: 0.53, en: "Full moon", de: "Vollmond", emoji: "🌕" },
    { max: 0.72, en: "Waning gibbous", de: "Abnehmender Mond", emoji: "🌖" },
    { max: 0.78, en: "Last quarter", de: "Letztes Viertel", emoji: "🌗" },
    { max: 0.97, en: "Waning crescent", de: "Abnehmende Sichel", emoji: "🌘" },
    { max: 1.01, en: "New moon", de: "Neumond", emoji: "🌑" },
  ];
  const p = phases.find((x) => frac <= x.max)!;
  return { name: de ? p.de : p.en, emoji: p.emoji, fraction: frac };
}

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
