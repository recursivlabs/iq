# Recursiv Next.js App Template

Minimal Next.js starter for deploying apps on Recursiv.

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
