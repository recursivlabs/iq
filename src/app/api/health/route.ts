import { NextResponse } from 'next/server';
import { hasRedisStore, storeProvider } from '../_lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const persistentStorage = hasRedisStore();

  return NextResponse.json({
    ok: true,
    app: 'iqwars',
    storage: {
      provider: storeProvider(),
      persistent: persistentStorage,
      requiredForLaunch: true,
    },
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
