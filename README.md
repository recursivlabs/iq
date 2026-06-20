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

`audit:launch` requires persistent storage. Configure one of these production env sets on Vercel before launch:

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`
- `REDIS_URL`

Without Redis/KV, leaderboards, geography maps, profiles, usernames, presence, reminders, and room messages fall back to serverless `/tmp` storage and are not reliable across deployments or runtime instances.

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
