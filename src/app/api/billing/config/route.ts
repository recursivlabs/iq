import { NextResponse } from 'next/server';
import { publicBillingConfig, resolveBillingConfig } from '../../_lib/billingConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(publicBillingConfig(resolveBillingConfig()), {
    headers: { 'cache-control': 'no-store' },
  });
}
