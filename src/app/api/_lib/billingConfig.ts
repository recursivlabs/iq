export type BillingProvider = 'app_subscription' | 'payment_link' | 'not_configured';

export type BillingConfig = {
  provider: BillingProvider;
  checkoutReady: boolean;
  tier: string | null;
  paymentLinkUrl: string | null;
  productName: string;
  priceCents: number;
  priceLabel: string;
};

const DEFAULT_PRODUCT_NAME = 'IQ WARS Unlimited';
const DEFAULT_PRICE_CENTS = 499;

function cleanText(value: unknown, fallback: string, max = 80) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function cleanTier(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^a-zA-Z0-9:_-]+/g, '').slice(0, 64);
}

function cleanPriceCents(value: unknown) {
  const cents = Number(value);
  if (!Number.isFinite(cents)) return DEFAULT_PRICE_CENTS;
  return Math.max(100, Math.min(99_900, Math.round(cents)));
}

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}/mo`;
}

function cleanCheckoutUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveBillingConfig(): BillingConfig {
  const tier = cleanTier(process.env.IQWARS_SUBSCRIPTION_TIER);
  const paymentLinkUrl = cleanCheckoutUrl(process.env.IQ_STRIPE_SIGNUP_URL)
    || cleanCheckoutUrl(process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK)
    || cleanCheckoutUrl(process.env.STRIPE_PAYMENT_LINK_URL);
  const provider: BillingProvider = tier ? 'app_subscription' : paymentLinkUrl ? 'payment_link' : 'not_configured';
  const priceCents = cleanPriceCents(process.env.IQ_STRIPE_PRICE_CENTS);

  return {
    provider,
    checkoutReady: provider !== 'not_configured',
    tier: tier || null,
    paymentLinkUrl,
    productName: cleanText(process.env.IQ_STRIPE_PRODUCT_NAME, DEFAULT_PRODUCT_NAME),
    priceCents,
    priceLabel: formatUsd(priceCents),
  };
}

export function publicBillingConfig(config = resolveBillingConfig()) {
  return {
    provider: config.provider,
    checkoutReady: config.checkoutReady,
    tier: config.tier,
    productName: config.productName,
    priceCents: config.priceCents,
    priceLabel: config.priceLabel,
  };
}
