import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const COMMIT_ENV_KEYS = [
  'IQWARS_COMMIT_SHA',
  'SOURCE_COMMIT',
  'COOLIFY_GIT_COMMIT',
  'GIT_COMMIT',
  'GIT_COMMIT_SHA',
  'GITHUB_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'RENDER_GIT_COMMIT',
  'HEROKU_SLUG_COMMIT',
];

const BRANCH_ENV_KEYS = [
  'IQWARS_GIT_BRANCH',
  'SOURCE_BRANCH',
  'COOLIFY_GIT_BRANCH',
  'GIT_BRANCH',
  'GITHUB_REF_NAME',
  'VERCEL_GIT_COMMIT_REF',
  'RAILWAY_GIT_BRANCH',
];

function cleanCommit(value: unknown) {
  if (typeof value !== 'string') return null;
  const commit = value.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  return commit.length >= 7 && commit.length <= 64 ? commit.slice(0, 40) : null;
}

function cleanBranch(value: unknown) {
  if (typeof value !== 'string') return null;
  const branch = value.trim().replace(/[^a-zA-Z0-9._/-]+/g, '').slice(0, 120);
  return branch || null;
}

function firstEnv(keys: string[], cleaner: (value: unknown) => string | null) {
  for (const key of keys) {
    const value = cleaner(process.env[key]);
    if (value) return { key, value };
  }
  return null;
}

function gitDirFromPath(gitPath: string) {
  try {
    const stat = statSync(gitPath);
    if (stat.isDirectory()) return gitPath;
    if (!stat.isFile()) return null;
    const pointer = readFileSync(gitPath, 'utf8').trim();
    const match = pointer.match(/^gitdir:\s*(.+)$/i);
    if (!match) return null;
    return path.resolve(path.dirname(gitPath), match[1]);
  } catch {
    return null;
  }
}

function readPackedRef(gitDir: string, ref: string) {
  try {
    const packed = readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    const line = packed.split(/\r?\n/).find((entry) => entry.endsWith(` ${ref}`));
    return cleanCommit(line?.split(' ')[0]);
  } catch {
    return null;
  }
}

function readGitInfoFromDir(startDir: string) {
  let current = startDir;
  for (let depth = 0; depth < 6; depth += 1) {
    const gitDir = gitDirFromPath(path.join(current, '.git'));
    if (gitDir && existsSync(path.join(gitDir, 'HEAD'))) {
      try {
        const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
        if (head.startsWith('ref:')) {
          const ref = head.slice(4).trim();
          const commit = cleanCommit(readFileSync(path.join(gitDir, ref), 'utf8')) || readPackedRef(gitDir, ref);
          return {
            commit,
            branch: cleanBranch(ref.replace(/^refs\/heads\//, '')),
            source: commit ? 'git-head' : 'git-head-missing-ref',
          };
        }
        const commit = cleanCommit(head);
        return { commit, branch: null, source: commit ? 'git-detached-head' : 'git-head-invalid' };
      } catch {
        return { commit: null, branch: null, source: 'git-read-error' };
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return { commit: null, branch: null, source: 'not-found' };
}

export function getBuildInfo() {
  const envCommit = firstEnv(COMMIT_ENV_KEYS, cleanCommit);
  const envBranch = firstEnv(BRANCH_ENV_KEYS, cleanBranch);
  const git = envCommit ? null : readGitInfoFromDir(process.cwd());

  return {
    app: 'iqwars',
    commit: envCommit?.value || git?.commit || null,
    shortCommit: (envCommit?.value || git?.commit || '').slice(0, 8) || null,
    branch: envBranch?.value || git?.branch || null,
    source: envCommit?.key || git?.source || 'unknown',
  };
}
