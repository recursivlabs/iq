#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { Pool } from 'pg';

const STORE_KEYS = [
  { key: 'world-iq:leaderboards:v2', description: 'Global, room, geography, and all-time leaderboard entries.' },
  { key: 'world-iq:official-attempts:v1', description: 'One-official-run-per-day attempt locks and canonical score metadata.' },
  { key: 'world-iq:profiles:v1', description: 'Saved public profile metadata and privacy-filtered profile records.' },
  { key: 'world-iq:room-messages:v1', description: 'Room chat messages.' },
  { key: 'world-iq:reminders:v1', description: 'Daily reminder email records and send timestamps.' },
  { key: 'world-iq:usernames:v1', description: 'Claimed username records.' },
  { key: 'world-iq:presence:v1', description: 'Short-lived active-session presence state.' },
  { key: 'world-iq:rate-limits:v1', description: 'Durable anti-abuse rate-limit buckets.' },
  { key: 'world-iq:health-check:v1', description: 'Readiness round-trip probe value.' },
];

const args = process.argv.slice(2);

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function hasFlag(name) {
  return args.includes(name);
}

function usage() {
  return [
    'Usage:',
    '  pnpm backup:export -- --out /secure/path/iqwars-store.json',
    '  pnpm backup:export -- --env /path/to/.env --out /secure/path/iqwars-store.json',
    '  pnpm backup:export -- --restore /secure/path/iqwars-store.json --yes',
    '  pnpm backup:export -- --manifest',
    '',
    'Supported stores:',
    '  UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN',
    '  KV_REST_API_URL + KV_REST_API_TOKEN',
    '  REDIS_URL',
    '  IQWARS_DATABASE_URL, POSTGRES_URL, or DATABASE_URL',
  ].join('\n');
}

async function loadEnvFile(file) {
  if (!file) return;
  const text = await readFile(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function redisRestConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function redisUrlConfig() {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function postgresUrlConfig() {
  const url = process.env.IQWARS_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function postgresTableName() {
  const name = process.env.IQWARS_STORE_TABLE || 'iqwars_json_store';
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name) ? name : '';
}

async function redisRestCommand(argsForRedis) {
  const config = redisRestConfig();
  if (!config) return undefined;
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(argsForRedis),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Redis REST ${response.status}`);
  }
  return data?.result ?? null;
}

function encodeRedisCommand(argsForRedis) {
  return `*${argsForRedis.length}\r\n${argsForRedis.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join('')}`;
}

function parseRedisResponse(buffer, offset = 0) {
  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd < 0) throw new Error('Incomplete Redis response.');
  const line = buffer.toString('utf8', offset + 1, lineEnd);
  const nextOffset = lineEnd + 2;
  if (type === '+') return { value: line, offset: nextOffset };
  if (type === '-') throw new Error(line || 'Redis error.');
  if (type === ':') return { value: Number(line), offset: nextOffset };
  if (type === '$') {
    const length = Number(line);
    if (length < 0) return { value: null, offset: nextOffset };
    const end = nextOffset + length;
    if (buffer.length < end + 2) throw new Error('Incomplete Redis bulk response.');
    return { value: buffer.toString('utf8', nextOffset, end), offset: end + 2 };
  }
  if (type === '*') {
    const values = [];
    let cursor = nextOffset;
    for (let index = 0; index < Number(line); index += 1) {
      const parsed = parseRedisResponse(buffer, cursor);
      values.push(parsed.value);
      cursor = parsed.offset;
    }
    return { value: values, offset: cursor };
  }
  throw new Error(`Unsupported Redis response type: ${type}`);
}

async function redisTcpCommand(argsForRedis) {
  const url = redisUrlConfig();
  if (!url) return null;
  const commands = [];
  const password = decodeURIComponent(url.password || '');
  const username = decodeURIComponent(url.username || '');
  if (password) commands.push(username ? ['AUTH', username, password] : ['AUTH', password]);
  const db = url.pathname.replace('/', '');
  if (db) commands.push(['SELECT', db]);
  commands.push(argsForRedis);

  const payload = commands.map(encodeRedisCommand).join('');
  const port = Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379));
  const host = url.hostname;
  return await new Promise((resolve, reject) => {
    const socket = url.protocol === 'rediss:'
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const chunks = [];
    let settled = false;
    function fail(error) {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    }
    socket.setTimeout(5000, () => fail(new Error('Redis connection timed out.')));
    socket.on('error', fail);
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      try {
        const buffer = Buffer.concat(chunks);
        let offset = 0;
        let value = null;
        for (let index = 0; index < commands.length; index += 1) {
          const parsed = parseRedisResponse(buffer, offset);
          value = parsed.value;
          offset = parsed.offset;
        }
        settled = true;
        socket.end();
        resolve(value);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Incomplete Redis')) return;
        fail(error instanceof Error ? error : new Error('Redis parse failed.'));
      }
    });
  });
}

async function redisCommand(argsForRedis) {
  const rest = await redisRestCommand(argsForRedis);
  if (rest !== undefined) return rest;
  return await redisTcpCommand(argsForRedis);
}

function providerName() {
  if (redisRestConfig()) return 'redis-rest';
  if (redisUrlConfig()) return 'redis-url';
  if (postgresUrlConfig()) return 'postgres';
  return 'none';
}

async function exportFromRedis() {
  const rows = [];
  for (const item of STORE_KEYS) {
    const raw = await redisCommand(['GET', item.key]);
    rows.push({
      ...item,
      exists: typeof raw === 'string',
      raw: typeof raw === 'string' ? raw : null,
      sha256: typeof raw === 'string' ? createHash('sha256').update(raw).digest('hex') : null,
    });
  }
  return rows;
}

async function restoreToRedis(rows) {
  for (const row of rows) {
    if (!row.exists || typeof row.raw !== 'string') continue;
    await redisCommand(['SET', row.key, row.raw]);
  }
}

async function postgresPool() {
  const parsed = postgresUrlConfig();
  if (!parsed) return null;
  const sslMode = parsed.searchParams.get('sslmode');
  const ssl = sslMode === 'disable' ? false : (sslMode === 'require' || parsed.hostname.includes('neon.tech') ? { rejectUnauthorized: false } : undefined);
  return new Pool({
    connectionString: parsed.toString(),
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl,
  });
}

async function exportFromPostgres() {
  const pool = await postgresPool();
  const table = postgresTableName();
  if (!pool || !table) throw new Error('Postgres store is not configured.');
  try {
    const rows = [];
    for (const item of STORE_KEYS) {
      const result = await pool.query(`select value from ${table} where key = $1`, [item.key]);
      const exists = Boolean(result.rows[0]);
      const raw = exists ? JSON.stringify(result.rows[0].value) : null;
      rows.push({
        ...item,
        exists,
        raw,
        sha256: raw ? createHash('sha256').update(raw).digest('hex') : null,
      });
    }
    return rows;
  } finally {
    await pool.end();
  }
}

async function restoreToPostgres(rows) {
  const pool = await postgresPool();
  const table = postgresTableName();
  if (!pool || !table) throw new Error('Postgres store is not configured.');
  try {
    await pool.query(`
      create table if not exists ${table} (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    for (const row of rows) {
      if (!row.exists || typeof row.raw !== 'string') continue;
      await pool.query(
        `insert into ${table} (key, value, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [row.key, row.raw],
      );
    }
  } finally {
    await pool.end();
  }
}

async function exportRows() {
  const provider = providerName();
  if (provider === 'redis-rest' || provider === 'redis-url') return await exportFromRedis();
  if (provider === 'postgres') return await exportFromPostgres();
  throw new Error('No persistent store configured. Set Redis/KV/Postgres env vars or pass --env.');
}

async function restoreRows(rows) {
  const provider = providerName();
  if (provider === 'redis-rest' || provider === 'redis-url') return await restoreToRedis(rows);
  if (provider === 'postgres') return await restoreToPostgres(rows);
  throw new Error('No persistent store configured. Set Redis/KV/Postgres env vars or pass --env.');
}

function backupPayload(rows) {
  return {
    schema: 'iqwars-json-store-backup/v1',
    generatedAt: new Date().toISOString(),
    provider: providerName(),
    app: 'iqwars',
    warning: 'Contains user data. Store encrypted with restricted operator access.',
    rows,
  };
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }
  if (hasFlag('--manifest')) {
    console.log(JSON.stringify({ keys: STORE_KEYS }, null, 2));
    return;
  }
  await loadEnvFile(valueAfter('--env'));

  const restorePath = valueAfter('--restore');
  if (restorePath) {
    if (!hasFlag('--yes')) throw new Error('Restore is destructive. Re-run with --yes after verifying the target environment.');
    const parsed = JSON.parse(await readFile(restorePath, 'utf8'));
    if (parsed?.schema !== 'iqwars-json-store-backup/v1' || !Array.isArray(parsed.rows)) {
      throw new Error('Invalid IQ WARS backup file.');
    }
    await restoreRows(parsed.rows);
    console.log(JSON.stringify({ restored: parsed.rows.filter((row) => row.exists).length, provider: providerName() }, null, 2));
    return;
  }

  const out = valueAfter('--out');
  if (!out) throw new Error(`Missing --out.\n${usage()}`);
  const rows = await exportRows();
  const payload = backupPayload(rows);
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    file: path.resolve(out),
    provider: payload.provider,
    exported: rows.filter((row) => row.exists).length,
    missing: rows.filter((row) => !row.exists).map((row) => row.key),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
