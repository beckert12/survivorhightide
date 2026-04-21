# Survivor High Tide

Landing page and episode repository for the Survivor High Tide podcast.

## Features

- Responsive podcast landing page
- Host/photo and logo asset slots
- Latest episode feature area
- Episode repository loaded from the podcast RSS feed
- Native audio players for RSS enclosure audio
- Express API endpoint that avoids browser RSS/CORS issues

## Local Development

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## RSS Feed

The default podcast RSS feed is:

```text
https://anchor.fm/s/fab26970/podcast/rss
```

To override it in production, set:

```text
PODCAST_RSS_URL=https://example.com/podcast/rss
```

## Deploying to Render

Create a Render Web Service connected to this repo with:

```text
Build Command: npm install
Start Command: npm start
```

The app reads `process.env.PORT`, so it works with Render's assigned port automatically.
