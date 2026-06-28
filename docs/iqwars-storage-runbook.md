# IQ WARS Storage Backup Runbook

IQ WARS stores production state in the shared JSON store behind Redis/KV/Postgres. The launch gate is:

```bash
curl -sS https://iqwars.app/api/ready
```

The response must show `launchReady: true`, `storage.persistent: true`, and `storage.verified: true` before launch traffic or restore work.

## Data Covered

The backup/export script covers every app-owned JSON key:

- `world-iq:leaderboards:v2` - global, room, geography, and all-time leaderboard entries.
- `world-iq:official-attempts:v1` - one-official-run-per-day attempt locks.
- `world-iq:profiles:v1` - saved player profile records.
- `world-iq:room-messages:v1` - room chat messages.
- `world-iq:reminders:v1` - daily reminder email records.
- `world-iq:usernames:v1` - claimed username records.
- `world-iq:presence:v1` - short-lived active-session state.
- `world-iq:rate-limits:v1` - anti-abuse buckets.
- `world-iq:health-check:v1` - readiness round-trip probe value.

These exports can contain emails, profile text, room messages, player IDs, and score history. Treat backup files as sensitive user data.

## Export

Run from an operator shell with the same production store credentials used by Coolify. Use `--env` only with a local secrets file that is already protected.

```bash
pnpm backup:export -- --env /secure/iqwars.env --out /secure/backups/iqwars-store-$(date -u +%Y%m%dT%H%M%SZ).json
```

If the shell already has `REDIS_URL`, `UPSTASH_REDIS_REST_URL` plus token, `KV_REST_API_URL` plus token, or `IQWARS_DATABASE_URL`/`POSTGRES_URL`/`DATABASE_URL`, omit `--env`.

The backup file includes:

- schema marker `iqwars-json-store-backup/v1`
- provider type
- generated timestamp
- known key manifest
- raw JSON value per key
- SHA-256 checksum per exported key

## Restore

Restore is destructive for the keys present in the backup. Confirm the target app, DNS, and store provider first:

```bash
curl -sS https://iqwars.app/api/health
pnpm backup:export -- --manifest
```

Then restore only after a second operator has reviewed the target environment and backup file:

```bash
pnpm backup:export -- --env /secure/iqwars.env --restore /secure/backups/iqwars-store-20260628T230000Z.json --yes
```

After restore:

```bash
curl -sS https://iqwars.app/api/ready
pnpm audit:launch
```

For friend-room incidents, verify at least one known room URL after restore:

```bash
curl -sS 'https://iqwars.app/api/leaderboards?group=room-kdljky&agents=false'
```

## Retention

- Keep daily encrypted exports for 30 days.
- Keep weekly encrypted exports for 12 weeks.
- Keep monthly encrypted exports for 12 months.
- Store exports outside the app host with restricted operator access.
- Do not email backup files or paste them into support chats.
- Delete ad hoc restore-test exports after the test is complete.

## Restore Rehearsal

Run a non-production restore rehearsal before public launch changes that touch storage code:

1. Export production to an encrypted file.
2. Restore into an isolated Redis/KV/Postgres target, never into production.
3. Run `pnpm audit:source`.
4. Point a temporary app instance at the restored store.
5. Run `pnpm audit:launch` against that temporary origin.
6. Confirm leaderboards, room all-time highscores, profiles, reminders, and username claims read back.

## Failure Response

If `/api/ready` reports storage as not persistent or not verified:

1. Stop production promotion.
2. Check Coolify environment variables for `REDIS_URL`, Upstash/KV REST credentials, or Postgres URL.
3. Run a manual export from the last known-good environment if reachable.
4. Restore only after the target store is configured and `/api/health` can reach it.
5. Run `pnpm audit:launch` before sending traffic back to the app.
