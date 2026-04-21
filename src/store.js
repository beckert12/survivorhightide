import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('data');
const WATCHLIST_PATH = path.join(DATA_DIR, 'watchlist.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureFile(filePath, value);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function loadWatchlist() {
  return readJson(WATCHLIST_PATH, [
    {
      id: 'route-iah-jfk',
      origin: 'IAH',
      destination: 'JFK',
      cabin: 'ECONOMY',
      adults: 1
    },
    {
      id: 'route-hou-lax',
      origin: 'HOU',
      destination: 'LAX',
      cabin: 'ECONOMY',
      adults: 1
    }
  ]);
}

export function saveWatchlist(routes) {
  writeJson(WATCHLIST_PATH, routes);
}

export function loadHistory() {
  return readJson(HISTORY_PATH, []);
}

export function saveHistory(history) {
  writeJson(HISTORY_PATH, history);
}

export function appendHistory(record) {
  const history = loadHistory();
  history.push(record);
  if (history.length > 2000) {
    history.splice(0, history.length - 2000);
  }
  saveHistory(history);
}
