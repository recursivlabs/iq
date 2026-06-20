import { NextResponse } from 'next/server';
import { verifyPersistentStore } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const storage = await verifyPersistentStore();
  const status = storage.persistent && !storage.verified ? 503 : 200;

  return NextResponse.json({
    ok: status === 200,
    app: 'iqwars',
    storage: {
      provider: storage.provider,
      persistent: storage.persistent,
      verified: storage.verified,
      requiredForLaunch: true,
      launchReady: storage.persistent && storage.verified,
      error: storage.error,
    },
  }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
