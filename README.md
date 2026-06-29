# Recursiv Next.js App Template

Minimal Next.js starter for deploying apps on Recursiv.

## IQ WARS launch checks

Run the source audit before shipping code:

```bash
pnpm audit:source
```

Run the live audit after deploying production:

```bash
pnpm audit:live
```

Run the launch gate when production should be considered release-ready:

```bash
pnpm audit:launch
```

Run the authenticated launch gate when profile and room-chat happy paths need
proof with a real Recursiv project-scoped app-member key. The runner mints a
throwaway audit player key with the correct IQ WARS project scope and injects
it only into the child audit process:

```bash
pnpm audit:launch:authenticated
```

Run the email-code auth proof when the signup/login path needs full production
verification. This sends two IQ WARS OTP emails to a generated controlled test
address, retrieves the sent messages through Resend, verifies the OTPs through
`iqwars.app`, proves the project-scoped player cookie can write/read a profile,
and confirms the second login returns the first login's stable linked player ID.
This is the release gate for `IQWARS-025`; it will fail while production OTP
emails are still Recursiv-branded instead of IQ WARS-branded:

```bash
RESEND_API_KEY=... pnpm auth:proof
```

Run the reminder/streak proof when the daily re-engagement loop needs full
production verification. This creates a controlled proof room and reminder,
triggers the cron endpoint for only that generated recipient, retrieves the
sent message through Resend, and verifies streak, personal best, room record,
room link, and unsubscribe copy:

```bash
RESEND_API_KEY=... \
IQ_REMINDER_CRON_TOKEN=... \
pnpm reminder:proof
```

This is the release gate for `IQWARS-030`; it fails until production has
`RESEND_API_KEY` and `IQ_REMINDER_CRON_TOKEN` configured and the sender path is
deliverable.

Run the production deployment proof when pushing a commit to `iqwars.app`.
This command monitors `/api/health`, `/api/ready`, and `/api/version` during
the deployment window and fails if any sample goes unhealthy or the final
commit does not match:

```bash
COOLIFY_API_URL=... \
COOLIFY_API_TOKEN=... \
pnpm deploy:prove -- --trigger --expected-commit <commit>
```

If the deploy was already triggered externally, omit `--trigger` and keep the
same `--expected-commit` to run the no-downtime monitor only.

Current Coolify/GitHub deployment status:

- GitHub repo: `recursivlabs/iq`
- Coolify app: `recursiv-iq-standalone` (`nu38x7705v0z961mpbighllf`)
- Domains: `iqwars.app`, `www.iqwars.app`, `iq.on.recursiv.io`, `iq-next.on.recursiv.io`
- Branch: `main`
- Verified manual path: `pnpm deploy:prove -- --trigger --expected-commit <commit>`
- Verified normal-push path: GitHub webhook id `647492155` auto-deploys `main` pushes to Coolify; keep proving each pushed commit with `pnpm deploy:prove -- --expected-commit <commit>`.
- Known non-A+ blockers: email-code OTP branding proof, real checkout completion, reminder deliverability, and legal review remain tracked in `docs/iqwars-feature-status.tsv`.

Production exposes two operational checks:

- `/api/health` returns liveness and storage diagnostics. It may return `200` while `launchReady:false` so the app can remain inspectable during setup.
- `/api/ready` is the strict release/monitoring gate. It returns `503` until persistent Redis/KV storage is configured, round-trip verified, and the Recursiv project API key can access the IQ WARS project.

`audit:launch` requires persistent storage. Configure one of these production env sets on Coolify before launch:

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`
- `REDIS_URL`
- `IQWARS_DATABASE_URL`, `POSTGRES_URL`, or `DATABASE_URL`

Without Redis/KV/Postgres, leaderboards, geography maps, profiles, usernames, presence, reminders, and room messages fall back to serverless `/tmp` storage and are not reliable across deployments or runtime instances.

The SQL path stores JSON app state in a single table, `iqwars_json_store` by default. Override it with `IQWARS_STORE_TABLE` if the database requires a different table name.

The Recursiv envs must point to the same IQ WARS project:

- `IQWARS_RECURSIV_PROJECT_ID`
- `IQWARS_RECURSIV_API_KEY`

`/api/health` reports `recursiv.verified` and `recursiv.projectAccess`; both must be true before launch.

For launch, Coolify must expose `iqwars.app` and `www.iqwars.app`, provide the
Redis/KV/Postgres envs above, and set `SOURCE_COMMIT` or another supported
commit env so `/api/version` can prove what code is live. After every
production deploy, run `pnpm smoke:prod`, `pnpm audit:launch -- --expected-commit
<commit>`, and `pnpm deploy:prove -- --expected-commit <commit>` if the proof
was not already used to trigger the deploy.

## Usage

1. Create a new repo on GitHub: `gh repo create recursivlabs/<app-name> --public`
2. Copy this template: `cp -r templates/nextjs-app/* <your-repo>/`
3. Update `package.json` name field
4. Push to GitHub
5. Create a Recursiv project via MCP: `create_project`
6. Deploy via MCP: `deploy_project`

## Defaults (don't change without reason)

- **Port:** 3000 (Coolify default)
- **Config:** `next.config.mjs` (not `.ts` — Next 14 doesn't support it)
- **No `output: 'standalone'`** — Nixpacks handles the build
- **`.gitignore`** includes `.next/` — never commit build artifacts
