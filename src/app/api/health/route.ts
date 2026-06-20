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
  const recursivConfiguredButBroken = recursiv.configured && (!recursiv.verified || !recursiv.projectAccess);
  const status = storage.persistent && !storage.verified || recursivConfiguredButBroken ? 503 : 200;
  const launchReady = storage.persistent && storage.verified && recursiv.verified && recursiv.projectAccess;

  return NextResponse.json({
    ok: status === 200,
    app: 'iqwars',
    launchReady,
    storage: {
      provider: storage.provider,
      persistent: storage.persistent,
      verified: storage.verified,
      requiredForLaunch: true,
      launchReady: storage.persistent && storage.verified,
      error: storage.error,
    },
    recursiv: {
      origin: recursiv.origin,
      configured: recursiv.configured,
      verified: recursiv.verified,
      projectAccess: recursiv.projectAccess,
      requiredForLaunch: true,
      error: recursiv.error,
    },
  }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
