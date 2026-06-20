import { NextResponse } from 'next/server';
import { verifyPersistentStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const storage = await verifyPersistentStore();
  const launchReady = storage.persistent && storage.verified;

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
    },
  }, {
    status: launchReady ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
