# Survivor High Tide

Landing page and episode repository for the Survivor High Tide podcast.

## How it works

- Static pages, styles, and images live in `public/` and are served by Cloudflare.
- `worker/index.js` is a Cloudflare Worker that handles the API routes:
  - `/episodes.json` (and `/api/episodes`) reads the podcast RSS feed.
  - `/api/fantasy-standings` logs in to Fantasy Survivor Game and reads the league standings.
  - Both responses are cached at Cloudflare's edge (15 and 30 minutes).
- `wrangler.jsonc` holds the Worker config, including the survivorhightide.com custom domain.

## Deploying

Pushes to `main` deploy automatically through Cloudflare Workers Builds.

The fantasy login lives in Cloudflare as Worker secrets `FANTASY_EMAIL` and `FANTASY_PASSWORD`
(Workers & Pages → survivor-high-tide → Settings → Runtime variables and secrets).

## Local Development

```bash
npm install
npm run dev
```

The fantasy standings need a `.dev.vars` file with `FANTASY_EMAIL` and `FANTASY_PASSWORD` to work locally.
