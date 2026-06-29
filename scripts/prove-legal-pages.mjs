#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'src/app/IqApp.tsx');
const packagePath = path.join(root, 'package.json');
const auditPath = path.join(root, 'scripts/audit-iqwars.mjs');
const smokePath = path.join(root, 'scripts/smoke-iqwars-prod.mjs');

const failures = [];
const passes = [];

function read(file) {
  return readFileSync(file, 'utf8');
}

function pass(message) {
  passes.push(message);
}

function assert(condition, message) {
  if (condition) pass(message);
  else failures.push(message);
}

function findArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  return process.argv[index + 1] || '';
}

function normalizeRoute(route) {
  return route.startsWith('/') ? route : `/${route}`;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'iqwars-legal-proof/1.0' } });
  const text = await response.text();
  return { response, text };
}

function assertSnippets(text, snippets, label) {
  for (const snippet of snippets) {
    assert(text.includes(snippet), `${label} contains "${snippet}".`);
  }
}

const app = read(appPath);
const packageJson = JSON.parse(read(packagePath));
const audit = read(auditPath);
const smoke = read(smokePath);

const privacySnippets = [
  'IQ WARS Privacy Policy',
  'Recursiv Labs, Inc.',
  'bill@recursiv.io',
  'Optional demographic and social data',
  'Cookies, local storage, analytics, and ads',
  'Privacy choices and rights',
  'Global Privacy Control',
  'International users',
  'not directed to children under 13',
  'We do not sell personal data for money',
];

const termsSnippets = [
  'IQ WARS Terms of Service',
  'entertainment and competition product',
  'Scores are entertainment and competitive signals',
  'Fair play',
  'Billing, cancellation, and refunds',
  'manage or cancel paid access',
  'Agents and automation',
  'Ads and sponsored content',
  'We do not guarantee uninterrupted service',
  'Governing law',
];

const footerSnippets = [
  "onView('about')",
  "onView('privacy')",
  "onView('terms')",
  "onView('research')",
  'https://docs.recursiv.io/guides/ai-tools/connect-claude-desktop',
  'mailto:bill@recursiv.io',
];

assertSnippets(app, privacySnippets, 'Privacy source');
assertSnippets(app, termsSnippets, 'Terms source');
assertSnippets(app, footerSnippets, 'Footer source');
assert(app.includes('Legal · Last updated June 2026'), 'Legal pages display a last-updated date.');
assert(app.includes('not a clinical IQ test, admission test, employment screen, high-IQ society qualifier, or supervised psychometric assessment'), 'About/legal positioning rejects high-stakes score use.');
assert(app.includes('not clinical IQ diagnoses, educational/admission decisions, employment signals, or proof of innate intelligence'), 'About page keeps legal-safe reasoning-game caveats.');
assert(packageJson.scripts?.['legal:proof'] === 'node scripts/prove-legal-pages.mjs --origin https://iqwars.app', 'Package exposes a production legal proof command.');
assert(audit.includes("['/privacy'") && audit.includes("['/terms'") && audit.includes('Privacy choices and rights') && audit.includes('Billing, cancellation, and refunds'), 'Launch audit covers strengthened privacy and terms snippets.');
assert(smoke.includes('Privacy choices and rights') && smoke.includes('Billing, cancellation, and refunds'), 'Production smoke covers strengthened legal snippets.');

const origin = (findArg('--origin') || process.env.IQWARS_LEGAL_ORIGIN || '').replace(/\/$/, '');
if (origin) {
  const liveRoutes = [
    {
      route: '/privacy',
      snippets: [
        'IQ WARS Privacy Policy',
        'Recursiv Labs',
        'Privacy choices and rights',
        'Cookies, local storage, analytics, and ads',
        'Global Privacy Control',
        'International users',
        'bill@recursiv.io',
      ],
    },
    {
      route: '/terms',
      snippets: [
        'IQ WARS Terms of Service',
        'Fair play',
        'Billing, cancellation, and refunds',
        'manage or cancel paid access',
        'Agents and automation',
        'Ads and sponsored content',
      ],
    },
    {
      route: '/about',
      snippets: [
        'A daily global reasoning-game ranking',
        'not clinical IQ diagnoses, educational/admission decisions, employment signals, or proof of innate intelligence',
      ],
    },
  ];

  for (const routeCheck of liveRoutes) {
    const route = normalizeRoute(routeCheck.route);
    const { response, text } = await fetchText(`${origin}${route}`);
    assert(response.ok, `Live ${route} responds with 2xx status.`);
    assert(response.headers.get('content-type')?.includes('text/html'), `Live ${route} returns HTML.`);
    assertSnippets(text, routeCheck.snippets, `Live ${route}`);
  }
}

for (const message of passes) console.log(`PASS ${message}`);
for (const message of failures) console.error(`FAIL ${message}`);

console.log(JSON.stringify({
  passed: passes.length,
  failed: failures.length,
  live: Boolean(origin),
}, null, 2));

if (failures.length) process.exit(1);
