// Dates as farmers read them: "26 Oct 2026" / "26 Okt 2026", with Today/Leo and Yesterday/Jana (design.md §13).
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  sw: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'],
};

export function parseIso(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(iso: string, lang: string) {
  const d = parseIso(iso);
  const months = lang === 'sw' ? MONTHS.sw : MONTHS.en;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Today", "Yesterday" or the date. */
export function relativeDay(iso: string, lang: string, t: (k: string) => string) {
  const days = Math.round((startOfToday().getTime() - parseIso(iso).getTime()) / 86400000);
  if (days === 0) return t('dates.today');
  if (days === 1) return t('dates.yesterday');
  return formatDate(iso, lang);
}

export function weeksSince(iso: string) {
  return Math.max(0, Math.floor((startOfToday().getTime() - parseIso(iso).getTime()) / (7 * 86400000)));
}

/**
 * Accepts DD/MM/YYYY (what people type in Kenya) and returns YYYY-MM-DD, or null. Dates after today
 * are refused unless futureDays allows them (a planting date a farmer is planning).
 */
export function parseDmy(input: string, futureDays = 0): string | null {
  const m = input.trim().match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  const latest = startOfToday();
  latest.setDate(latest.getDate() + futureDays + 1);
  if (date.getMonth() !== mo - 1 || date >= latest || y < 2000) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function shiftDays(iso: string, days: number) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local calendar day (YYYY-MM-DD) of a timestamp such as createdAt. */
export function localDay(isoTimestamp: string) {
  const d = new Date(isoTimestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "14 Sep" / "14 Sep" without the year, for chart axes. */
export function shortDate(iso: string, lang: string) {
  return formatDate(iso, lang).split(' ').slice(0, 2).join(' ');
}

const WEEKDAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  sw: ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'],
};

/** "Thu" / "Alhamisi". */
export function weekday(iso: string, lang: string) {
  return (lang === 'sw' ? WEEKDAYS.sw : WEEKDAYS.en)[parseIso(iso).getDay()];
}

/** "Tue 27 Oct" / "Jumanne 27 Okt" for the Home header. */
export function todayLabel(lang: string) {
  const days = lang === 'sw' ? WEEKDAYS.sw : WEEKDAYS.en;
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${days[d.getDay()]} ${shortDate(iso, lang)}`;
}
