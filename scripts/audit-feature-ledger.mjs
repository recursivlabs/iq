import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ledgerPath = path.join(root, 'docs/iqwars-feature-status.tsv');
const expectedHeaders = [
  'Feature ID',
  'Area',
  'Feature',
  'User story',
  'Expected behavior',
  'Code evidence',
  'Verification evidence',
  'Status',
  'Grade',
  'Issues',
  'Next action',
  'Last verified',
];

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.log(`WARN ${message}`);
}

const raw = readFileSync(ledgerPath, 'utf8').trimEnd();
const lines = raw.split('\n');
const headers = lines[0]?.split('\t') || [];
const rows = lines.slice(1).map((line, index) => ({
  line: index + 2,
  values: line.split('\t'),
}));

if (headers.join('\t') === expectedHeaders.join('\t')) {
  pass('Feature ledger has the canonical header.');
} else {
  fail('Feature ledger header does not match the canonical schema.');
}

const seen = new Set();
const gradeCounts = new Map();
const statusCounts = new Map();
const notAPlus = [];
const stale = [];

for (const row of rows) {
  if (row.values.length !== expectedHeaders.length) {
    fail(`Line ${row.line} has ${row.values.length} columns instead of ${expectedHeaders.length}.`);
    continue;
  }

  const entry = Object.fromEntries(headers.map((header, index) => [header, row.values[index] || '']));
  const id = entry['Feature ID'];
  if (!/^IQWARS-\d{3}$/.test(id)) fail(`Line ${row.line} has invalid feature id ${id || '(blank)'}.`);
  if (seen.has(id)) fail(`Duplicate feature id ${id}.`);
  seen.add(id);

  for (const field of ['Area', 'Feature', 'User story', 'Expected behavior', 'Code evidence', 'Verification evidence', 'Status', 'Grade', 'Next action', 'Last verified']) {
    if (!entry[field]?.trim()) fail(`${id} is missing ${field}.`);
  }

  const grade = entry.Grade.trim();
  const status = entry.Status.trim();
  gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
  statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  if (grade !== 'A+') notAPlus.push({ id, grade, status, next: entry['Next action'] });
  if (!/^2026-\d{2}-\d{2}$/.test(entry['Last verified'])) stale.push({ id, lastVerified: entry['Last verified'] });
}

if (rows.length >= 40) pass(`Feature ledger covers ${rows.length} user stories.`);
else fail(`Feature ledger only covers ${rows.length} user stories; expected at least 40 for this app.`);

if (process.exitCode) {
  console.log(JSON.stringify({ rows: rows.length, grades: Object.fromEntries(gradeCounts), statuses: Object.fromEntries(statusCounts) }, null, 2));
} else {
  pass('Feature ledger rows are well-formed and uniquely identified.');
  if (stale.length) warn(`${stale.length} rows have non-canonical Last verified dates.`);
  warn(`${notAPlus.length} rows are not yet graded A+.`);
  console.log(JSON.stringify({
    rows: rows.length,
    grades: Object.fromEntries([...gradeCounts.entries()].sort()),
    statuses: Object.fromEntries([...statusCounts.entries()].sort()),
    not_a_plus_sample: notAPlus.slice(0, 12),
  }, null, 2));
}
