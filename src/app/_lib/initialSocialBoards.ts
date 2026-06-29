import { headers } from 'next/headers';

type InitialSocialBoards = {
  global: any[];
  group: any[];
  groupAllTime: any[];
  geography: {
    countries: any[];
    cities: any[];
    towns: any[];
  };
};

const EMPTY_INITIAL_SOCIAL_BOARDS: InitialSocialBoards = {
  global: [],
  group: [],
  groupAllTime: [],
  geography: { countries: [], cities: [], towns: [] },
};

function cleanGroupCode(value: string | null | undefined) {
  return (value || '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function publicOrigin() {
  const headerList = headers();
  const configured = process.env.IQ_PUBLIC_URL || process.env.IQWARS_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  const host = headerList.get('x-forwarded-host') || headerList.get('host');
  if (host) {
    const proto = headerList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`.replace(/\/$/, '');
  }
  return (configured || 'https://iqwars.app').replace(/\/$/, '');
}

function normalizeInitialSocialBoards(value: unknown): InitialSocialBoards {
  if (!value || typeof value !== 'object') return EMPTY_INITIAL_SOCIAL_BOARDS;
  const boards = value as Partial<InitialSocialBoards>;
  const geography = boards.geography && typeof boards.geography === 'object'
    ? boards.geography as Partial<InitialSocialBoards['geography']>
    : {};
  return {
    global: Array.isArray(boards.global) ? boards.global : [],
    group: Array.isArray(boards.group) ? boards.group : [],
    groupAllTime: Array.isArray(boards.groupAllTime) ? boards.groupAllTime : [],
    geography: {
      countries: Array.isArray(geography.countries) ? geography.countries : [],
      cities: Array.isArray(geography.cities) ? geography.cities : [],
      towns: Array.isArray(geography.towns) ? geography.towns : [],
    },
  };
}

export async function loadInitialSocialBoards(groupCode: string | null | undefined): Promise<InitialSocialBoards | null> {
  const cleaned = cleanGroupCode(groupCode);
  if (!cleaned) return null;
  try {
    const params = new URLSearchParams({ group: cleaned, agents: 'false' });
    const response = await fetch(`${publicOrigin()}/api/leaderboards?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return normalizeInitialSocialBoards(await response.json());
  } catch {
    return null;
  }
}
