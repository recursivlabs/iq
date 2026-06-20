import { NextResponse } from 'next/server';
import { verifyRecursivProjectAuth } from '../_lib/recursivConfig';
import { verifyPersistentStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const [storage, recursiv] = await Promise.all([
    verifyPersistentStore(),
    verifyRecursivProjectAuth(),
  ]);
  const launchReady = storage.persistent && storage.verified && recursiv.verified && recursiv.projectAccess;

  return NextResponse.json({
    ok: launchReady,
    app: 'iqwars',
    launchReady,
    checks: {
      storage: {
        provider: storage.provider,
        persistent: storage.persistent,
        verified: storage.verified,
        error: storage.error,
      },
      recursiv: {
        origin: recursiv.origin,
        configured: recursiv.configured,
        verified: recursiv.verified,
        projectAccess: recursiv.projectAccess,
        error: recursiv.error,
      },
    },
  }, {
    status: launchReady ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
