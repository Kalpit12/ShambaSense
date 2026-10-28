// 3-day forecast for a farmer's county, for the weather card on Home.
// Data: MET Norway Locationforecast 2.0 (free, CC BY 4.0, commercial use allowed; the app shows the credit).
// MET asks every caller to send an identifying User-Agent and to cache, so each county is fetched at most
// once an hour per function instance, whatever the number of farmers.
//
// POST { county: "Nyeri" } → { county, updatedAt, days: [{ date, min, max, rainMm, sky, windMax }] }
// verify_jwt is on, so only signed-in users can call it. No secrets needed.

// County headquarters (lat, lon), close enough for a county-level forecast.
const COUNTIES: Record<string, [number, number]> = {
  Baringo: [0.49, 35.74], Bomet: [-0.78, 35.34], Bungoma: [0.56, 34.56], Busia: [0.46, 34.11],
  'Elgeyo-Marakwet': [0.67, 35.51], Embu: [-0.53, 37.45], Garissa: [-0.45, 39.65], 'Homa Bay': [-0.53, 34.46],
  Isiolo: [0.35, 37.58], Kajiado: [-1.85, 36.79], Kakamega: [0.28, 34.75], Kericho: [-0.37, 35.28],
  Kiambu: [-1.17, 36.83], Kilifi: [-3.63, 39.85], Kirinyaga: [-0.5, 37.28], Kisii: [-0.68, 34.77],
  Kisumu: [-0.09, 34.77], Kitui: [-1.37, 38.01], Kwale: [-4.17, 39.45], Laikipia: [0.27, 36.54],
  Lamu: [-2.27, 40.9], Machakos: [-1.52, 37.26], Makueni: [-1.78, 37.63], Mandera: [3.94, 41.86],
  Marsabit: [2.33, 37.99], Meru: [0.05, 37.65], Migori: [-1.06, 34.47], Mombasa: [-4.04, 39.67],
  "Murang'a": [-0.72, 37.15], Nairobi: [-1.29, 36.82], Nakuru: [-0.3, 36.07], Nandi: [0.2, 35.1],
  Narok: [-1.08, 35.87], Nyamira: [-0.56, 34.94], Nyandarua: [-0.27, 36.38], Nyeri: [-0.42, 36.95],
  Samburu: [1.1, 36.7], Siaya: [0.06, 34.29], 'Taita-Taveta': [-3.4, 38.36], 'Tana River': [-1.5, 40.03],
  'Tharaka-Nithi': [-0.32, 37.65], 'Trans Nzoia': [1.02, 35.0], Turkana: [3.12, 35.6], 'Uasin Gishu': [0.51, 35.27],
  Vihiga: [0.08, 34.72], Wajir: [1.75, 40.06], 'West Pokot': [1.24, 35.11],
};

const USER_AGENT = 'ShambaSense/1.0 github.com/Kalpit12/ShambaSense';
const TTL_MS = 60 * 60 * 1000;
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // Kenya is UTC+3 all year.
const DAYS = 3;

type Sky = 'clear' | 'partly' | 'cloudy' | 'rain' | 'storm';
type Day = { date: string; min: number; max: number; rainMm: number; sky: Sky; windMax: number };
type Entry = {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number } };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
  };
};

const cache = new Map<string, { at: number; body: string }>();

const SKY_RANK: Sky[] = ['clear', 'partly', 'cloudy', 'rain', 'storm'];
function sky(symbol = ''): Sky {
  if (symbol.includes('thunder')) return 'storm';
  if (/rain|sleet|snow/.test(symbol)) return 'rain';
  if (/cloudy|fog/.test(symbol) && !symbol.startsWith('partly')) return 'cloudy';
  if (symbol.startsWith('partly') || symbol.startsWith('fair')) return 'partly';
  return 'clear';
}

const localDate = (ms: number) => new Date(ms + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
const localHour = (ms: number) => new Date(ms + NAIROBI_OFFSET_MS).getUTCHours();
const round1 = (n: number) => Math.round(n * 10) / 10;

function summarize(series: Entry[], now = Date.now()): Day[] {
  // After 3 pm most of today is gone, so the card starts from tomorrow.
  const today = localDate(localHour(now) >= 15 ? now + 86400_000 : now);
  const days = new Map<string, { temps: number[]; rain: number; sky: Sky; wind: number }>();
  let coveredUntil = 0;
  for (const e of series) {
    const t = Date.parse(e.time);
    const date = localDate(t);
    if (date < today) continue;
    if (!days.has(date)) {
      if (days.size >= DAYS) break;
      days.set(date, { temps: [], rain: 0, sky: 'clear', wind: 0 });
    }
    const d = days.get(date)!;
    const { air_temperature, wind_speed } = e.data.instant.details;
    if (typeof air_temperature === 'number') d.temps.push(air_temperature);
    if (typeof wind_speed === 'number') d.wind = Math.max(d.wind, wind_speed);
    // Rain: hourly amounts while MET gives them, then 6-hour amounts, never counting an hour twice.
    if (t >= coveredUntil) {
      if (e.data.next_1_hours?.details?.precipitation_amount != null) {
        d.rain += e.data.next_1_hours.details.precipitation_amount;
        coveredUntil = t + 3600_000;
      } else if (e.data.next_6_hours?.details?.precipitation_amount != null) {
        d.rain += e.data.next_6_hours.details.precipitation_amount;
        coveredUntil = t + 6 * 3600_000;
      }
    }
    // Sky: the worst outlook for the hours that start between 6 am and 3 pm, when farm work happens.
    const h = localHour(t);
    const symbol = e.data.next_6_hours?.summary?.symbol_code ?? e.data.next_1_hours?.summary?.symbol_code;
    if (h >= 6 && h <= 15 && symbol) {
      const s = sky(symbol);
      if (SKY_RANK.indexOf(s) > SKY_RANK.indexOf(d.sky)) d.sky = s;
    }
  }
  return [...days.entries()]
    .filter(([, d]) => d.temps.length > 0)
    .map(([date, d]) => ({
      date,
      min: Math.round(Math.min(...d.temps)),
      max: Math.round(Math.max(...d.temps)),
      rainMm: round1(d.rain),
      sky: d.sky,
      windMax: round1(d.wind),
    }));
}

const json = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const { county } = await req.json().catch(() => ({}));
  const point = typeof county === 'string' ? COUNTIES[county] : undefined;
  if (!point) return json(400, { error: 'unknown_county' });

  const hit = cache.get(county);
  if (hit && Date.now() - hit.at < TTL_MS) return json(200, hit.body);

  let res: Response;
  try {
    res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${point[0]}&lon=${point[1]}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
  } catch (e) {
    console.error('weather', county, e);
    return hit ? json(200, hit.body) : json(502, { error: 'forecast_unavailable' });
  }
  if (!res.ok) {
    console.error('weather', county, res.status, (await res.text()).slice(0, 200));
    return hit ? json(200, hit.body) : json(502, { error: 'forecast_unavailable' });
  }
  const data = await res.json();
  const body = JSON.stringify({
    county,
    updatedAt: data?.properties?.meta?.updated_at ?? new Date().toISOString(),
    days: summarize(data?.properties?.timeseries ?? []),
  });
  cache.set(county, { at: Date.now(), body });
  return json(200, body);
});
