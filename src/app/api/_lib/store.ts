import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';

type RedisValue = string | number | null | RedisValue[];

const memoryStore = globalThis as typeof globalThis & {
  __worldIqStore?: Record<string, unknown>;
  __worldIqLocks?: Record<string, Promise<void>>;
  __worldIqPgPool?: Pool;
  __worldIqPgTableReady?: boolean;
};

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
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name) ? name : null;
}

function storageConfigurationError() {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  const postgresUrl = process.env.IQWARS_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  if (Boolean(restUrl) !== Boolean(restToken)) return 'incomplete_redis_rest_config';
  if (process.env.REDIS_URL && !redisUrlConfig()) return 'invalid_redis_url';
  if (postgresUrl && !postgresUrlConfig()) return 'invalid_postgres_url';
  if (postgresUrl && !postgresTableName()) return 'invalid_postgres_table';
  return null;
}

export function hasRedisStore() {
  return Boolean(redisRestConfig() || redisUrlConfig());
}

export function hasPostgresStore() {
  return Boolean(postgresUrlConfig());
}

export function hasPersistentStore() {
  return Boolean(hasRedisStore() || hasPostgresStore());
}

export function storeProvider() {
  if (storageConfigurationError()) return 'misconfigured';
  if (redisRestConfig()) return 'redis-rest';
  if (redisUrlConfig()) return 'redis-url';
  if (postgresUrlConfig()) return 'postgres';
  return 'ephemeral-fallback';
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message.slice(0, 160) : 'unknown storage error';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function redisRestCommand(args: string[]) {
  const config = redisRestConfig();
  if (!config) return undefined;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null) as { result?: RedisValue; error?: string } | null;
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Redis REST ${response.status}`);
  }
  return data?.result ?? null;
}

function encodeRedisCommand(args: string[]) {
  return `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join('')}`;
}

function parseRedisResponse(buffer: Buffer, offset = 0): { value: RedisValue; offset: number } {
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
    const count = Number(line);
    const values: RedisValue[] = [];
    let cursor = nextOffset;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseRedisResponse(buffer, cursor);
      values.push(parsed.value);
      cursor = parsed.offset;
    }
    return { value: values, offset: cursor };
  }
  throw new Error(`Unsupported Redis response type: ${type}`);
}

async function redisTcpCommand(args: string[]) {
  const url = redisUrlConfig();
  if (!url) return null;

  const commands: string[][] = [];
  const password = decodeURIComponent(url.password || '');
  const username = decodeURIComponent(url.username || '');
  if (password) commands.push(username ? ['AUTH', username, password] : ['AUTH', password]);
  const db = url.pathname.replace('/', '');
  if (db) commands.push(['SELECT', db]);
  commands.push(args);

  const payload = commands.map(encodeRedisCommand).join('');
  const port = Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379));
  const host = url.hostname;

  return await new Promise<RedisValue>((resolve, reject) => {
    const socket = url.protocol === 'rediss:'
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;

    function fail(error: Error) {
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
        let value: RedisValue = null;
        for (let index = 0; index < commands.length; index += 1) {
          const parsed = parseRedisResponse(buffer, offset);
          value = parsed.value;
          offset = parsed.offset;
        }
        if (settled) return;
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

async function redisCommand(args: string[]) {
  const rest = await redisRestCommand(args);
  if (rest !== undefined) return rest;
  return await redisTcpCommand(args);
}

function postgresConnectionString() {
  const parsed = postgresUrlConfig();
  return parsed ? parsed.toString() : '';
}

function postgresSsl(parsed: URL) {
  const sslMode = parsed.searchParams.get('sslmode');
  if (sslMode === 'disable') return false;
  if (sslMode === 'require' || parsed.hostname.includes('neon.tech')) return { rejectUnauthorized: false };
  return undefined;
}

function postgresPool() {
  const parsed = postgresUrlConfig();
  if (!parsed) return null;
  if (!memoryStore.__worldIqPgPool) {
    memoryStore.__worldIqPgPool = new Pool({
      connectionString: postgresConnectionString(),
      max: 4,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 5_000,
      ssl: postgresSsl(parsed),
    });
  }
  return memoryStore.__worldIqPgPool;
}

async function ensurePostgresTable(client: Pool | PoolClient) {
  if (memoryStore.__worldIqPgTableReady) return;
  const table = postgresTableName();
  if (!table) throw new Error('Invalid Postgres store table.');
  await client.query(`
    create table if not exists ${table} (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  memoryStore.__worldIqPgTableReady = true;
}

async function postgresReadJsonStore<T>(client: Pool | PoolClient, key: string, fallback: T): Promise<T> {
  const table = postgresTableName();
  if (!table) throw new Error('Invalid Postgres store table.');
  await ensurePostgresTable(client);
  const result = await client.query<{ value: T }>(`select value from ${table} where key = $1`, [key]);
  return result.rows[0]?.value ?? fallback;
}

async function postgresWriteJsonStore<T>(client: Pool | PoolClient, key: string, value: T) {
  const table = postgresTableName();
  if (!table) throw new Error('Invalid Postgres store table.');
  await ensurePostgresTable(client);
  await client.query(
    `insert into ${table} (key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

async function withLocalLock<T>(key: string, task: () => Promise<T>) {
  memoryStore.__worldIqLocks ||= {};
  const pending = memoryStore.__worldIqLocks[key] || Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = pending.catch(() => undefined).then(() => current);
  memoryStore.__worldIqLocks[key] = next;

  await pending.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (memoryStore.__worldIqLocks?.[key] === next) {
      delete memoryStore.__worldIqLocks[key];
    }
  }
}

async function acquireRedisLock(key: string) {
  const token = randomUUID();
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await redisCommand(['SET', key, token, 'NX', 'PX', '5000']);
    if (result === 'OK') return token;
    await sleep(35 + Math.floor(Math.random() * 45));
  }
  throw new Error('Timed out acquiring persistent store lock.');
}

async function releaseRedisLock(key: string, token: string) {
  const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  try {
    await redisCommand(['EVAL', script, '1', key, token]);
  } catch {
    const stored = await redisCommand(['GET', key]).catch(() => null);
    if (stored === token) await redisCommand(['DEL', key]).catch(() => null);
  }
}

export async function verifyPersistentStore() {
  const provider = storeProvider();
  const configurationError = storageConfigurationError();
  const nonce = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const key = 'world-iq:health-check:v1';

  if (configurationError) {
    return {
      provider,
      persistent: true,
      verified: false,
      error: configurationError,
    };
  }
  if (!hasRedisStore()) {
    if (hasPostgresStore()) {
      const pool = postgresPool();
      if (!pool) {
        return {
          provider,
          persistent: true,
          verified: false,
          error: 'postgres_not_configured',
        };
      }
      try {
        await postgresWriteJsonStore(pool, key, { nonce });
        const stored = await postgresReadJsonStore<{ nonce: string }>(pool, key, { nonce: '' });
        return {
          provider,
          persistent: true,
          verified: stored.nonce === nonce,
          error: stored.nonce === nonce ? null : 'roundtrip_mismatch',
        };
      } catch (error) {
        return {
          provider,
          persistent: true,
          verified: false,
          error: errorMessage(error),
        };
      }
    }
    return {
      provider,
      persistent: false,
      verified: false,
      error: 'not_configured',
    };
  }

  try {
    await redisCommand(['SET', key, nonce, 'EX', '120']);
    const stored = await redisCommand(['GET', key]);
    return {
      provider,
      persistent: true,
      verified: stored === nonce,
      error: stored === nonce ? null : 'roundtrip_mismatch',
    };
  } catch (error) {
    return {
      provider,
      persistent: true,
      verified: false,
      error: errorMessage(error),
    };
  }
}

function fallbackPath(fileName: string) {
  return path.join('/tmp', fileName);
}

export async function readJsonStore<T>(key: string, fallback: T, fileName: string): Promise<T> {
  memoryStore.__worldIqStore ||= {};

  if (hasRedisStore()) {
    const raw = await redisCommand(['GET', key]);
    if (typeof raw === 'string') return JSON.parse(raw) as T;
    return fallback;
  }

  const pool = postgresPool();
  if (pool) return await postgresReadJsonStore(pool, key, fallback);

  if (memoryStore.__worldIqStore[key]) return memoryStore.__worldIqStore[key] as T;
  try {
    const raw = await readFile(fallbackPath(fileName), 'utf8');
    const parsed = JSON.parse(raw) as T;
    memoryStore.__worldIqStore[key] = parsed;
    return parsed;
  } catch {
    memoryStore.__worldIqStore[key] = fallback;
    return fallback;
  }
}

export async function writeJsonStore<T>(key: string, value: T, fileName: string) {
  memoryStore.__worldIqStore ||= {};
  memoryStore.__worldIqStore[key] = value;

  if (hasRedisStore()) {
    await redisCommand(['SET', key, JSON.stringify(value)]);
    return;
  }

  const pool = postgresPool();
  if (pool) {
    await postgresWriteJsonStore(pool, key, value);
    return;
  }

  await mkdir(path.dirname(fallbackPath(fileName)), { recursive: true });
  await writeFile(fallbackPath(fileName), JSON.stringify(value), 'utf8');
}

export async function updateJsonStore<T, R>(
  key: string,
  fallback: T,
  fileName: string,
  updater: (current: T) => Promise<{ value: T; result: R }> | { value: T; result: R },
) {
  return await withLocalLock(key, async () => {
    const lockKey = `world-iq:lock:${key}`;
    const token = hasRedisStore() ? await acquireRedisLock(lockKey) : null;
    const pool = postgresPool();
    if (!token && pool) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1), 0)', [key]);
        const current = await postgresReadJsonStore<T>(client, key, fallback);
        const { value, result } = await updater(current);
        await postgresWriteJsonStore(client, key, value);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
    try {
      const current = await readJsonStore<T>(key, fallback, fileName);
      const { value, result } = await updater(current);
      await writeJsonStore(key, value, fileName);
      return result;
    } finally {
      if (token) await releaseRedisLock(lockKey, token);
    }
  });
}
