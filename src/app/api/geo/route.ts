import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type GeoSnapshot = {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  town: string | null;
  timeZone: string | null;
  source: 'edge' | 'timezone' | 'locale' | 'unknown';
};

function cleanHeaderValue(value: string | null) {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first) return null;
  try {
    return decodeURIComponent(first.replace(/\+/g, ' ')).replace(/\s+/g, ' ').trim() || null;
  } catch {
    return first.replace(/\s+/g, ' ').trim() || null;
  }
}

function readHeader(request: NextRequest, names: string[]) {
  for (const name of names) {
    const value = cleanHeaderValue(request.headers.get(name));
    if (value) return value;
  }
  return null;
}

function normalizeCountryCode(value: string | null) {
  if (!value) return null;
  const code = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if (code.length !== 2 || code === 'XX' || code === 'T1') return null;
  return code;
}

function countryName(countryCode: string | null) {
  if (!countryCode) return null;
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return names.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

function countryFromLocale(locale: string | null) {
  if (!locale) return null;
  try {
    const parsed = new Intl.Locale(locale);
    return normalizeCountryCode(parsed.region || null);
  } catch {
    const match = locale.match(/[-_]([A-Za-z]{2})\b/);
    return normalizeCountryCode(match?.[1] || null);
  }
}

function cityFromTimeZone(timeZone: string | null) {
  if (!timeZone || !timeZone.includes('/')) return null;
  const raw = timeZone.split('/').pop() || '';
  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

export async function GET(request: NextRequest) {
  const edgeCountryCode = normalizeCountryCode(readHeader(request, [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'cloudfront-viewer-country',
    'x-country-code',
  ]));
  const edgeRegion = readHeader(request, [
    'x-vercel-ip-country-region',
    'x-vercel-ip-region',
    'cf-region',
    'x-region',
  ]);
  const edgeCity = readHeader(request, [
    'x-vercel-ip-city',
    'cf-ipcity',
    'x-city',
  ]);
  const edgeTown = readHeader(request, [
    'x-vercel-ip-town',
    'cf-iptown',
    'x-town',
  ]);
  const headerTimeZone = readHeader(request, [
    'x-vercel-ip-timezone',
    'cf-timezone',
    'x-timezone',
  ]);

  const queryTimeZone = cleanHeaderValue(request.nextUrl.searchParams.get('tz'));
  const queryLocale = cleanHeaderValue(request.nextUrl.searchParams.get('locale'));
  const localeCountryCode = countryFromLocale(queryLocale);
  const timeZone = headerTimeZone || queryTimeZone;
  const city = edgeCity || cityFromTimeZone(timeZone);
  const countryCode = edgeCountryCode || localeCountryCode;
  const source: GeoSnapshot['source'] = edgeCountryCode || edgeCity ? 'edge' : city ? 'timezone' : countryCode ? 'locale' : 'unknown';

  const snapshot: GeoSnapshot = {
    country: countryName(countryCode),
    countryCode,
    region: edgeRegion,
    city,
    town: edgeTown || city,
    timeZone,
    source,
  };

  return NextResponse.json(snapshot, {
    headers: { 'cache-control': 'no-store' },
  });
}
