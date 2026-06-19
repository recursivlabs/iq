import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCESS_COOKIE = 'world_iq_paid';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    active: request.cookies.get(ACCESS_COOKIE)?.value === 'active',
    subscriptionId: null,
  });
}
