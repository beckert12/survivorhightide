// Cloudflare Worker: static files in /public are served automatically; this handles the API routes.

const DEFAULT_RSS_URL = 'https://anchor.fm/s/fab26970/podcast/rss';
const FSG_BASE = 'https://www.fantasysurvivorgame.com';
const FSG_GROUP_CODE = '827D-4FD8-D062';
const FANTASY_CACHE_SECONDS = 30 * 60;
const RSS_CACHE_SECONDS = 15 * 60;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&rsquo;/g, '\u2019')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Text pieces of a cell, split wherever there was a tag (keeps tribe and player name separate)
function cellParts(cellHtml) {
  return cellHtml
    .split(/<[^>]+>/)
    .map((part) => decodeEntities(part.replace(/\s+/g, ' ').trim()))
    .filter(Boolean);
}

function parseStandingsHtml(html) {
  const tableMatch = html.match(/<thead[\s\S]*?<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tableMatch) return [];

  // Map columns by header name so new/reordered columns on FSG don't shift the numbers
  const headers = [...tableMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((m) => cellParts(m[1]).join(' ').toLowerCase());
  const col = (name) => headers.findIndex((h) => h.startsWith(name));
  const idx = {
    rank: col('rank'), player: col('tribe') >= 0 ? col('tribe') : col('player'),
    survivor: col('survivor'), vote: col('vote'), sole: col('sole'),
    out: col('out'), week: col('week'), total: col('total'),
  };
  const num = (cells, key) => (idx[key] >= 0 ? Number(cells[idx[key]]?.join(' ')) || 0 : 0);

  return [...tableMatch[1].matchAll(/<tr[\s\S]*?<\/tr>/gi)].flatMap((rowMatch) => {
    const cells = [...rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellParts(m[1]));
    const rank = Number(cells[idx.rank]?.[0]);
    if (cells.length < headers.length || Number.isNaN(rank)) return [];
    const playerParts = cells[idx.player] || [];
    return [{
      rank,
      team: playerParts[0] || '',
      player: playerParts.slice(1).join(' ') || playerParts[0] || '',
      survivor: num(cells, 'survivor'),
      vote: num(cells, 'vote'),
      sole: num(cells, 'sole'),
      out: num(cells, 'out'),
      week: num(cells, 'week'),
      total: num(cells, 'total'),
    }];
  });
}

async function loadFantasyStandings(env) {
  const { FANTASY_EMAIL: email, FANTASY_PASSWORD: password } = env;
  // Until the login secrets are added on Cloudflare, borrow standings from the old Render server
  if ((!email || !password) && env.FANTASY_FALLBACK_URL) {
    const fallback = await fetch(env.FANTASY_FALLBACK_URL, { headers: { 'User-Agent': UA } });
    if (fallback.ok) return fallback.json();
  }
  if (!email || !password) {
    throw Object.assign(new Error('Fantasy credentials not configured. Add FANTASY_EMAIL and FANTASY_PASSWORD as Worker secrets.'), { status: 503 });
  }

  // POST login — stop at the 302 so we can grab the Set-Cookie
  const loginRes = await fetch(`${FSG_BASE}/login.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ email, password }).toString(),
    redirect: 'manual',
  });

  const rawCookies = loginRes.headers.getSetCookie();
  if (!rawCookies.length) {
    throw Object.assign(new Error('Login failed — check FANTASY_EMAIL and FANTASY_PASSWORD.'), { status: 401 });
  }
  const cookieStr = rawCookies.map((c) => c.split(';')[0]).join('; ');

  const standingsRes = await fetch(`${FSG_BASE}/standings.html?groupcode=${FSG_GROUP_CODE}`, {
    headers: { Cookie: cookieStr, 'User-Agent': UA },
  });

  const standings = parseStandingsHtml(await standingsRes.text());
  return { updatedAt: new Date().toISOString(), groupCode: FSG_GROUP_CODE, standings };
}

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

function parsePodcastFeed(xml, rssUrl) {
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
      rssUrl
    },
    episodes: items
  };
}

async function loadPodcastEpisodes(env) {
  const rssUrl = env.PODCAST_RSS_URL || DEFAULT_RSS_URL;
  const response = await fetch(rssUrl, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': UA },
  });
  if (!response.ok) throw Object.assign(new Error(`RSS feed returned ${response.status}`), { status: 502 });
  return parsePodcastFeed(await response.text(), rssUrl);
}

// Serve from Cloudflare's edge cache when fresh; otherwise run the loader and cache the result
async function cachedJson(request, ctx, maxAge, loader) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname);
  const hit = await cache.match(key);
  if (hit) return hit;

  const response = Response.json(await loader(), {
    headers: { 'Cache-Control': `public, max-age=${maxAge}` },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/api/health') {
        return Response.json({ ok: true, site: 'Survivor High Tide' });
      }
      if (pathname === '/api/fantasy-standings') {
        return await cachedJson(request, ctx, FANTASY_CACHE_SECONDS, () => loadFantasyStandings(env));
      }
      if (pathname === '/api/episodes' || pathname === '/episodes.json') {
        return await cachedJson(request, ctx, RSS_CACHE_SECONDS, () => loadPodcastEpisodes(env));
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return Response.json({ error: error.message || 'Unexpected error' }, { status: error.status || 500 });
    }
  },
};
