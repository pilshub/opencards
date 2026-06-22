# Vercel Deploy Runbook

1. Create the Vercel project from the repository root.
2. Confirm the project root is the repo root, not `packages/app`.
3. Set the build command to `npm run build:app`.
4. Set the output directory to `packages/app/dist-web`.
5. Leave framework preset disabled or set to `null`.
6. Use `npm install` as the install command.
7. Use Node 22.6 or newer to match `engines.node`.
   Note: `npm run build:app` first builds `@opencards/core`, producing `dist/`, then builds
   the app so Vite can resolve workspace imports. A clean checkout requires this composite build.
8. Run `npm run check` locally before production deploys.
9. Deploy previews should use the same root `vercel.json`.
