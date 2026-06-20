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

Production exposes two operational checks:

- `/api/health` returns liveness and storage diagnostics. It may return `200` while `launchReady:false` so the app can remain inspectable during setup.
- `/api/ready` is the strict release/monitoring gate. It returns `503` until persistent Redis/KV storage is configured, round-trip verified, and the Recursiv project API key can access the IQ WARS project.

`audit:launch` requires persistent storage. Configure one of these production env sets on Vercel before launch:

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

Recommended Vercel setup path:

```bash
vercel integration add upstash/upstash-kv \
  --name iqwars-redis \
  --environment production \
  --plan free \
  --metadata primaryRegion=iad1 \
  --metadata eviction=false \
  --metadata autoUpgrade=false \
  --no-env-pull \
  --scope minds-b4320dbb
```

If the CLI pauses on marketplace terms, accept the terms in the Vercel browser page, rerun the command, redeploy production, and then run `pnpm audit:launch`.

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
