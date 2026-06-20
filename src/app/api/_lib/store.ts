import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';

type RedisValue = string | number | null | RedisValue[];

const memoryStore = globalThis as typeof globalThis & {
  __worldIqStore?: Record<string, unknown>;
};

function redisRestConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function redisUrlConfig() {
  const url = process.env.REDIS_URL || '';
  return url ? new URL(url) : null;
}

export function hasRedisStore() {
  return Boolean(redisRestConfig() || redisUrlConfig());
}

export function storeProvider() {
  if (redisRestConfig()) return 'redis-rest';
  if (redisUrlConfig()) return 'redis-url';
  return 'ephemeral-fallback';
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message.slice(0, 160) : 'unknown storage error';
}

async function redisRestCommand(args: string[]) {
  const config = redisRestConfig();
  if (!config) return null;

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
  if (rest !== null) return rest;
  return await redisTcpCommand(args);
}

export async function verifyPersistentStore() {
  const provider = storeProvider();
  if (!hasRedisStore()) {
    return {
      provider,
      persistent: false,
      verified: false,
      error: 'not_configured',
    };
  }

  const nonce = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const key = 'world-iq:health-check:v1';

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

  await mkdir(path.dirname(fallbackPath(fileName)), { recursive: true });
  await writeFile(fallbackPath(fileName), JSON.stringify(value), 'utf8');
}
