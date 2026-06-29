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
const RECURSIV_AUTH_CACHE_MS = 5 * 60 * 1000;

const recursivCache = globalThis as typeof globalThis & {
  __iqwarsRecursivProjectAuth?: { status: RecursivProjectAuthStatus; expiresAt: number };
  __iqwarsRecursivProjectAuthPromise?: Promise<RecursivProjectAuthStatus>;
};

async function readErrorCode(response: Response) {
  const data = await response.json().catch(() => null) as { error?: { code?: string; type?: string } | string } | null;
  if (typeof data?.error === 'string') return data.error.slice(0, 80);
  return (data?.error?.code || data?.error?.type || `http_${response.status}`).slice(0, 80);
}

function isRateLimitError(error: string | null) {
  return error === 'rate_limit_exceeded' || error === 'http_429';
}

async function fetchRecursivProjectAuth(): Promise<RecursivProjectAuthStatus> {
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
      const error = await readErrorCode(userResponse);
      if (isRateLimitError(error)) {
        return {
          origin: RECURSIV_AUTH_ORIGIN,
          configured,
          verified: true,
          projectAccess: true,
          error: 'rate_limit_deferred',
        };
      }
      return {
        origin: RECURSIV_AUTH_ORIGIN,
        configured,
        verified: false,
        projectAccess: false,
        error,
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

    const projectError = projectResponse.ok ? null : await readErrorCode(projectResponse);
    if (isRateLimitError(projectError)) {
      return {
        origin: RECURSIV_AUTH_ORIGIN,
        configured,
        verified: true,
        projectAccess: true,
        error: 'rate_limit_deferred',
      };
    }

    return {
      origin: RECURSIV_AUTH_ORIGIN,
      configured,
      verified: true,
      projectAccess: projectResponse.ok,
      error: projectError,
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

export async function verifyRecursivProjectAuth(): Promise<RecursivProjectAuthStatus> {
  const cached = recursivCache.__iqwarsRecursivProjectAuth;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.status;
  }

  if (!recursivCache.__iqwarsRecursivProjectAuthPromise) {
    recursivCache.__iqwarsRecursivProjectAuthPromise = fetchRecursivProjectAuth().then((status) => {
      if (status.verified && status.projectAccess) {
        recursivCache.__iqwarsRecursivProjectAuth = {
          status,
          expiresAt: Date.now() + RECURSIV_AUTH_CACHE_MS,
        };
      }
      return status;
    }).finally(() => {
      recursivCache.__iqwarsRecursivProjectAuthPromise = undefined;
    });
  }

  const status = await recursivCache.__iqwarsRecursivProjectAuthPromise;
  if (!status.verified || !status.projectAccess) {
    const stale = recursivCache.__iqwarsRecursivProjectAuth?.status;
    if (stale && (status.error === 'rate_limit_exceeded' || status.error === 'rate_limit_deferred')) {
      return stale;
    }
  }
  return status;
}
