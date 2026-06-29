import { NextResponse } from 'next/server';
import { getBuildInfo } from '../_lib/buildInfo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    ...getBuildInfo(),
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
