#!/usr/bin/env node

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 120) };
  }
  return { response, data };
}

function paidTier(value) {
  return typeof value === 'string' && value && value !== 'free';
}

async function main() {
  const origin = String(valueAfter('--origin') || process.env.IQWARS_AUDIT_ORIGIN || 'https://iqwars.app').replace(/\/+$/, '');
  const playerApiKey = valueAfter('--player-api-key') || process.env.IQWARS_PAID_PLAYER_API_KEY || '';
  const expectedTier = valueAfter('--expected-tier') || process.env.IQWARS_EXPECTED_PAID_TIER || '';

  const billingConfig = await requestJson(`${origin}/api/billing/config`);
  assert(billingConfig.response.ok && billingConfig.data?.checkoutReady === true, 'Billing config is not checkout-ready.', {
    status: billingConfig.response.status,
    data: billingConfig.data,
  });
  assert(!Object.prototype.hasOwnProperty.call(billingConfig.data || {}, 'paymentLinkUrl') && !Object.prototype.hasOwnProperty.call(billingConfig.data || {}, 'url'), 'Billing config leaks a checkout URL.');

  assert(playerApiKey, 'checkout completion proof requires a paid IQ WARS player API key. Set IQWARS_PAID_PLAYER_API_KEY after completing a real checkout; this proof never creates fake paid state.', {
    provider: billingConfig.data.provider || null,
    checkoutReady: Boolean(billingConfig.data.checkoutReady),
    tier: billingConfig.data.tier || null,
    priceLabel: billingConfig.data.priceLabel || null,
  });

  const playerCookie = `iqwars_player_api_key=${playerApiKey}`;
  const status = await requestJson(`${origin}/api/checkout-status?tier=${encodeURIComponent(expectedTier || 'plus')}`, {
    headers: {
      Cookie: playerCookie,
    },
  });
  const statusSetCookie = status.response.headers.get('set-cookie') || '';
  assert(status.response.ok, 'Checkout status request failed for the paid player key.', {
    status: status.response.status,
    data: status.data,
  });
  assert(status.data?.active === true, 'Paid player checkout status is not active.', {
    data: status.data,
  });
  assert(paidTier(status.data?.tier), 'Paid player checkout status did not return a paid tier.', {
    tier: status.data?.tier || null,
  });
  if (expectedTier) {
    assert(status.data.tier === expectedTier, 'Paid player tier did not match expected tier.', {
      expectedTier,
      actualTier: status.data.tier,
    });
  }
  assert(statusSetCookie.includes('world_iq_paid=active'), 'Checkout status did not write an active paid-access cookie.');

  const access = await requestJson(`${origin}/api/access`, {
    headers: {
      Cookie: `${playerCookie}; world_iq_paid=active`,
    },
  });
  const accessSetCookie = access.response.headers.get('set-cookie') || '';
  assert(access.response.ok, 'Access status request failed for the paid player key.', {
    status: access.response.status,
    data: access.data,
  });
  assert(access.data?.active === true, 'Access API did not report active paid access for the paid player key.', {
    data: access.data,
  });
  assert(accessSetCookie.includes('world_iq_paid=active'), 'Access API did not preserve an active paid-access cookie.');

  console.log('PASS IQ WARS checkout completion proof passed');
  console.log(JSON.stringify({
    origin,
    billing: {
      provider: billingConfig.data.provider,
      checkoutReady: billingConfig.data.checkoutReady,
      tier: billingConfig.data.tier || null,
      priceLabel: billingConfig.data.priceLabel,
    },
    checkoutStatus: {
      active: Boolean(status.data.active),
      status: status.data.status || null,
      tier: status.data.tier || null,
      currentPeriodEnd: status.data.currentPeriodEnd || null,
      paidCookieActive: statusSetCookie.includes('world_iq_paid=active'),
    },
    access: {
      active: Boolean(access.data.active),
      paidCookieActive: accessSetCookie.includes('world_iq_paid=active'),
    },
  }, null, 2));
}

main().catch((error) => {
  const details = error?.details ? ` ${JSON.stringify(error.details)}` : '';
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}${details}`);
  process.exit(1);
});
