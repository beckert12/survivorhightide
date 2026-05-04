import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/listen', (_req, res) => {
  res.sendFile('listen.html', { root: 'public' });
});

app.get('/fantasy', (_req, res) => {
  res.sendFile('fantasy.html', { root: 'public' });
});

app.get('/shop', (_req, res) => {
  res.sendFile('shop.html', { root: 'public' });
});

app.get('/about', (_req, res) => {
  res.sendFile('about.html', { root: 'public' });
});

const PODCAST_RSS_URL = process.env.PODCAST_RSS_URL || 'https://anchor.fm/s/fab26970/podcast/rss';

const FSG_BASE = 'https://www.fantasysurvivorgame.com';
const FSG_GROUP_CODE = '827D-4FD8-D062';
const FANTASY_CACHE_MS = 30 * 60 * 1000;
let fantasyCache = { fetchedAt: 0, data: null };

function parseStandingsHtml(html) {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const rows = [...tbodyMatch[1].matchAll(rowRe)];
  return rows.flatMap((rowMatch) => {
    const cells = [...rowMatch[0].matchAll(cellRe)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').trim()
    );
    if (cells.length < 8 || !cells[0] || Number.isNaN(Number(cells[0]))) return [];
    return [{
      rank: Number(cells[0]),
      player: cells[1],
      survivor: Number(cells[2]) || 0,
      vote: Number(cells[3]) || 0,
      sole: Number(cells[4]) || 0,
      out: Number(cells[5]) || 0,
      week: Number(cells[6]) || 0,
      total: Number(cells[7]) || 0,
    }];
  });
}

async function loadFantasyStandings() {
  const now = Date.now();
  if (fantasyCache.data && now - fantasyCache.fetchedAt < FANTASY_CACHE_MS) {
    return fantasyCache.data;
  }

  const email = process.env.FANTASY_EMAIL;
  const password = process.env.FANTASY_PASSWORD;
  if (!email || !password) {
    throw Object.assign(new Error('Fantasy credentials not configured. Add FANTASY_EMAIL and FANTASY_PASSWORD in Render environment variables.'), { status: 503 });
  }

  const loginRes = await axios.post(
    `${FSG_BASE}/login.html`,
    new URLSearchParams({ email, password }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
      timeout: 15000,
    }
  );

  const rawCookies = loginRes.headers['set-cookie'];
  if (!rawCookies?.length) {
    throw Object.assign(new Error('Login failed — check FANTASY_EMAIL and FANTASY_PASSWORD.'), { status: 401 });
  }
  const cookieStr = rawCookies.map((c) => c.split(';')[0]).join('; ');

  const standingsRes = await axios.get(
    `${FSG_BASE}/standings.html?groupcode=${FSG_GROUP_CODE}`,
    { headers: { Cookie: cookieStr }, timeout: 15000 }
  );

  const standings = parseStandingsHtml(standingsRes.data);
  const data = { updatedAt: new Date().toISOString(), groupCode: FSG_GROUP_CODE, standings };
  fantasyCache = { fetchedAt: now, data };
  return data;
}

app.get('/api/fantasy-standings', async (_req, res, next) => {
  try {
    res.json(await loadFantasyStandings());
  } catch (error) {
    next(error);
  }
});
const RSS_CACHE_MS = 15 * 60 * 1000;
let episodeCache = {
  fetchedAt: 0,
  data: null
};

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(value = '') {
  return decodeXml(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTagValue(xml, tagName) {
  const escapedTagName = tagName.replace(':', '\\:');
  const match = xml.match(new RegExp(`<${escapedTagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTagName}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function getAttributeValue(xml, tagName, attributeName) {
  const escapedTagName = tagName.replace(':', '\\:');
  const match = xml.match(new RegExp(`<${escapedTagName}\\b[^>]*\\s${attributeName}="([^"]+)"`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function classifyEpisode(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('interview') || text.includes('draft') || text.includes('bonus')) return 'bonus';
  if (text.includes('preview') || text.includes('premiere') || text.includes('winner pick')) return 'preview';
  return 'recap';
}

function parseDuration(value) {
  if (!value) return '';
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some(Number.isNaN)) return value;

  if (parts.length === 3) {
    const [hours, minutes] = parts;
    return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
  }

  if (parts.length === 2) {
    const [minutes] = parts;
    return `${minutes} min`;
  }

  return value;
}

function parseRssDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function parsePodcastFeed(xml) {
  const channelTitle = getTagValue(xml, 'title') || 'Survivor High Tide';
  const channelDescription = stripHtml(getTagValue(xml, 'description'));
  const channelImage =
    getAttributeValue(xml, 'itunes:image', 'href') ||
    getTagValue(getTagValue(xml, 'image'), 'url') ||
    '';

  const itemMatches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  const items = itemMatches.map((match, index) => {
    const item = match[0];
    const title = getTagValue(item, 'title') || `Episode ${index + 1}`;
    const rawDescription = getTagValue(item, 'content:encoded') || getTagValue(item, 'description');
    const description = stripHtml(rawDescription);
    const pubDate = getTagValue(item, 'pubDate');
    const enclosureUrl = getAttributeValue(item, 'enclosure', 'url');
    const link = getTagValue(item, 'link') || enclosureUrl || '#';
    const image = getAttributeValue(item, 'itunes:image', 'href') || channelImage;
    const duration = parseDuration(getTagValue(item, 'itunes:duration'));

    return {
      id: getTagValue(item, 'guid') || link || `episode-${index + 1}`,
      number: itemMatches.length - index,
      title,
      date: parseRssDate(pubDate),
      type: classifyEpisode(title, description),
      duration,
      description,
      url: link,
      audioUrl: enclosureUrl,
      image
    };
  });

  return {
    podcast: {
      title: channelTitle,
      description: channelDescription,
      image: channelImage,
      rssUrl: PODCAST_RSS_URL
    },
    episodes: items
  };
}

async function loadPodcastEpisodes() {
  const now = Date.now();
  if (episodeCache.data && now - episodeCache.fetchedAt < RSS_CACHE_MS) {
    return episodeCache.data;
  }

  const response = await axios.get(PODCAST_RSS_URL, {
    responseType: 'text',
    timeout: 12000,
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml'
    }
  });

  const data = parsePodcastFeed(response.data);
  episodeCache = {
    fetchedAt: now,
    data
  };
  return data;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, site: 'Survivor High Tide' });
});

app.get('/api/episodes', async (_req, res, next) => {
  try {
    res.json(await loadPodcastEpisodes());
  } catch (error) {
    next(error);
  }
});

app.get('/episodes.json', async (_req, res, next) => {
  try {
    res.json(await loadPodcastEpisodes());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({ error: error.message || 'Unexpected error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Survivor High Tide listening on http://localhost:${port}`);
});
