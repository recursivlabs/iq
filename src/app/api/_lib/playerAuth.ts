import { type NextRequest } from 'next/server';

export const PLAYER_API_KEY_COOKIE = 'iqwars_player_api_key';

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');

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

    if (response.ok) {
      return { ok: true, apiKey };
    }

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
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Could not verify your IQ WARS account. Try again in a moment.',
    };
  }
}
