export type RecursivProjectAuthStatus = {
  origin: string;
  configured: boolean;
  verified: boolean;
  projectAccess: boolean;
  error: string | null;
};

const RECURSIV_AUTH_ORIGIN = (process.env.RECURSIV_AUTH_ORIGIN || 'https://api.recursiv.io').replace(/\/$/, '');
const IQWARS_PROJECT_ID = process.env.IQWARS_RECURSIV_PROJECT_ID || process.env.RECURSIV_PROJECT_ID || '';
const IQWARS_PROJECT_API_KEY = process.env.IQWARS_RECURSIV_API_KEY || process.env.RECURSIV_PROJECT_API_KEY || process.env.RECURSIV_API_KEY || '';

async function readErrorCode(response: Response) {
  const data = await response.json().catch(() => null) as { error?: { code?: string; type?: string } | string } | null;
  if (typeof data?.error === 'string') return data.error.slice(0, 80);
  return (data?.error?.code || data?.error?.type || `http_${response.status}`).slice(0, 80);
}

export async function verifyRecursivProjectAuth(): Promise<RecursivProjectAuthStatus> {
  const configured = Boolean(IQWARS_PROJECT_ID && IQWARS_PROJECT_API_KEY);
  if (!configured) {
    return {
      origin: RECURSIV_AUTH_ORIGIN,
      configured: false,
      verified: false,
      projectAccess: false,
      error: 'not_configured',
    };
  }

  try {
    const userResponse = await fetch(`${RECURSIV_AUTH_ORIGIN}/api/v1/users/me`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${IQWARS_PROJECT_API_KEY}`,
      },
      cache: 'no-store',
    });

    if (!userResponse.ok) {
      return {
        origin: RECURSIV_AUTH_ORIGIN,
        configured,
        verified: false,
        projectAccess: false,
        error: await readErrorCode(userResponse),
      };
    }

    const projectUrl = new URL(`${RECURSIV_AUTH_ORIGIN}/api/v1/databases`);
    projectUrl.searchParams.set('project_id', IQWARS_PROJECT_ID);
    const projectResponse = await fetch(projectUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${IQWARS_PROJECT_API_KEY}`,
      },
      cache: 'no-store',
    });

    return {
      origin: RECURSIV_AUTH_ORIGIN,
      configured,
      verified: true,
      projectAccess: projectResponse.ok,
      error: projectResponse.ok ? null : await readErrorCode(projectResponse),
    };
  } catch (error) {
    return {
      origin: RECURSIV_AUTH_ORIGIN,
      configured,
      verified: false,
      projectAccess: false,
      error: error instanceof Error && error.message ? error.message.slice(0, 80) : 'recursiv_unreachable',
    };
  }
}
