import { type NextRequest } from 'next/server';

export const PLAYER_API_KEY_COOKIE = 'iqwars_player_api_key';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');
const IQWARS_PROJECT_ID = process.env.IQWARS_RECURSIV_PROJECT_ID || process.env.RECURSIV_PROJECT_ID || '';

export type PlayerAccountCheck = {
  ok: true;
  apiKey: string;
} | {
  ok: false;
  status: 401 | 503;
  error: string;
};

export function playerApiKeyFromRequest(request: NextRequest) {
  return request.cookies.get(PLAYER_API_KEY_COOKIE)?.value || '';
}

export async function validatePlayerAccount(request: NextRequest): Promise<PlayerAccountCheck> {
  const apiKey = playerApiKeyFromRequest(request);
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      error: 'Connect an IQ WARS account before continuing.',
    };
  }

  try {
    const response = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/v1/users/me`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: 401,
          error: 'Connect an IQ WARS account again before continuing.',
        };
      }

      return {
        ok: false,
        status: 503,
        error: 'Could not verify your IQ WARS account. Try again in a moment.',
      };
    }

    if (!IQWARS_PROJECT_ID) {
      return {
        ok: false,
        status: 503,
        error: 'IQ WARS account verification is not configured yet.',
      };
    }

    const projectResponse = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/v1/projects/${encodeURIComponent(IQWARS_PROJECT_ID)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });

    if (projectResponse.ok) {
      return { ok: true, apiKey };
    }

    if (projectResponse.status === 401 || projectResponse.status === 403) {
      return {
        ok: false,
        status: 401,
        error: 'Connect an IQ WARS project account before continuing.',
      };
    }

    return {
      ok: false,
      status: 503,
      error: 'Could not verify your IQ WARS account. Try again in a moment.',
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Could not verify your IQ WARS account. Try again in a moment.',
    };
  }
}
