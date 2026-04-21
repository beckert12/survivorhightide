const fallbackEpisodes = [
  {
    number: 1,
    title: 'Survivor High Tide',
    date: '2026-04-04',
    type: 'recap',
    duration: '',
    description:
      'Episodes from the Survivor High Tide RSS feed will appear here when the Node server is running.',
    url: '#',
    audioUrl: ''
  }
];

const latestEpisodeEl = document.querySelector('#latest-episode');
const episodeGridEl = document.querySelector('#episode-grid');
const filterButtons = document.querySelectorAll('.filter-button');
const heroLogoEl = document.querySelector('.hero-logo');
const brandLogoEl = document.querySelector('.brand img');
const ledeEl = document.querySelector('.lede');

let episodes = fallbackEpisodes;

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEpisodeDate(dateString) {
  if (!dateString) return 'New episode';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateString));
}

function episodeMarkup(episode, headingLevel = 'h3') {
  const safeTitle = escapeHtml(episode.title);
  const safeDescription = escapeHtml(episode.description);
  const safeUrl = escapeHtml(episode.url || '#');
  const safeAudioUrl = escapeHtml(episode.audioUrl || '');

  return `
    <div class="episode-meta">
      <span>Episode ${escapeHtml(String(episode.number))}</span>
      <span>${formatEpisodeDate(episode.date)}</span>
      ${episode.duration ? `<span>${escapeHtml(episode.duration)}</span>` : ''}
      <span class="tag">${escapeHtml(episode.type || 'recap')}</span>
    </div>
    <${headingLevel}>${safeTitle}</${headingLevel}>
    <p>${safeDescription}</p>
    ${
      safeAudioUrl
        ? `<audio controls preload="none" src="${safeAudioUrl}" aria-label="Audio player for ${safeTitle}"></audio>`
        : ''
    }
    <a class="episode-link" href="${safeUrl}" aria-label="Open ${safeTitle}">Open episode</a>
  `;
}

function renderLatestEpisode() {
  const latest = episodes[0];
  latestEpisodeEl.innerHTML = episodeMarkup(latest, 'h3');
}

function renderEpisodes(filter = 'all') {
  const visibleEpisodes =
    filter === 'all' ? episodes : episodes.filter((episode) => episode.type === filter);

  episodeGridEl.innerHTML = visibleEpisodes.length
    ? visibleEpisodes
        .map((episode) => `<article class="episode-card">${episodeMarkup(episode)}</article>`)
        .join('')
    : '<p class="empty-state">No episodes match this filter yet.</p>';
}

function renderPodcastMeta(podcast) {
  if (podcast?.image) {
    heroLogoEl.src = podcast.image;
    brandLogoEl.src = podcast.image;
  }
}

async function loadEpisodesFromRss() {
  try {
    latestEpisodeEl.innerHTML = '<p>Loading the latest episodes...</p>';
    const response = await fetch('/episodes.json');
    if (!response.ok) throw new Error('Episode feed request failed.');

    const data = await response.json();
    if (Array.isArray(data.episodes) && data.episodes.length) {
      episodes = data.episodes;
      renderPodcastMeta(data.podcast);
    }
  } catch (error) {
    console.warn(error);
  }

  renderLatestEpisode();
  renderEpisodes();
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((currentButton) => currentButton.classList.remove('active'));
    button.classList.add('active');
    renderEpisodes(button.dataset.filter);
  });
});

loadEpisodesFromRss();
