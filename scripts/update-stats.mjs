import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Public GitHub REST data only. A failed refresh leaves the last good cards intact.
const username = '0xJoy07';
const root = fileURLToPath(new URL('../', import.meta.url));
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'joy-profile-cards', 'X-GitHub-Api-Version': '2022-11-28' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
async function api(endpoint) {
  const response = await fetch(`https://api.github.com${endpoint}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub ${endpoint}: HTTP ${response.status}`);
  return response.json();
}
async function repositories() {
  const result = [];
  for (let page = 1; ; page++) {
    const batch = await api(`/users/${username}/repos?type=owner&per_page=100&page=${page}`);
    result.push(...batch);
    if (batch.length < 100) return result;
  }
}
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const short = (value, limit) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const text = (x, y, value, size = 18, fill = '#455d7e', extra = '') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" ${extra}>${esc(value)}</text>`;
function frame(width, height, title, description, content, date) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title><desc id="desc">${esc(description)}</desc>
<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="16" fill="#f6faff" stroke="#d6e6fc" stroke-width="2"/>
<g font-family="Arial, Helvetica, sans-serif">
<circle cx="27" cy="29" r="5" fill="#ff5f57"/><circle cx="45" cy="29" r="5" fill="#ffbd2e"/><circle cx="63" cy="29" r="5" fill="#28c840"/>
${text(86, 35, title, 18, '#2e5e9e', 'font-weight="700"')}
<path d="M1 55H${width - 1}" stroke="#d6e6fc"/>
${content}
${text(26, height - 18, `Public GitHub data · updated ${date} UTC`, 13, '#6e819a')}
</g></svg>\n`;
}

const [user, repos, events] = await Promise.all([api(`/users/${username}`), repositories(), api(`/users/${username}/events/public?per_page=100`)]);
const date = new Date().toISOString().slice(0, 10);
const stars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
const metrics = [['PUBLIC REPOSITORIES', user.public_repos], ['FOLLOWERS', user.followers], ['REPOSITORY STARS', stars]];
const stats = frame(580, 330, '0xJoy07 / stats', `${user.public_repos} public repositories, ${user.followers} followers, ${stars} stars across owned public repositories including forks.`,
  metrics.map(([label, value], i) => text(28, 101 + i * 76, label, 13, '#6e819a', 'letter-spacing="1"') + text(548, 108 + i * 76, value, 34, '#397acb', 'font-weight="700" text-anchor="end"')).join(''), date);

const counts = new Map();
for (const repo of repos.filter(repo => !repo.fork && repo.language)) counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const rows = sorted.slice(0, 5);
if (sorted.length > 5) rows.push(['Other', sorted.slice(5).reduce((sum, [, count]) => sum + count, 0)]);
const total = [...counts.values()].reduce((a, b) => a + b, 0);
const colors = ['#61a3ff', '#8d9de0', '#61b9b2', '#d7ad66', '#a99bcb', '#9bb0c9'];
const languages = frame(580, 330, 'language breakdown', 'Count of non-fork public repositories by primary language; not code volume or proficiency.',
  text(26, 83, 'Primary language · non-fork repositories', 14, '#6e819a') + (rows.length ? rows.map(([language, count], i) => {
    const y = 115 + i * 30;
    return text(26, y, language, 16) + `<rect x="190" y="${y - 12}" width="275" height="11" rx="5" fill="#e3edfb"/><rect x="190" y="${y - 12}" width="${(275 * count / total).toFixed(1)}" height="11" rx="5" fill="${colors[i]}"/>` + text(548, y, `${count} repo${count === 1 ? '' : 's'}`, 14, '#455d7e', 'text-anchor="end"');
  }).join('') : text(26, 130, 'No language data available yet.', 18)), date);

const actions = { PushEvent: 'Pushed code', CreateEvent: 'Created', DeleteEvent: 'Deleted', PullRequestEvent: 'Pull request', IssuesEvent: 'Issue', IssueCommentEvent: 'Commented', WatchEvent: 'Starred', ForkEvent: 'Forked', ReleaseEvent: 'Release', PullRequestReviewEvent: 'Reviewed PR', PullRequestReviewCommentEvent: 'PR comment', PublicEvent: 'Made public' };
const recent = events.slice(0, 5);
const activity = frame(1200, 332, 'recent public activity', 'Latest events returned by the GitHub public events API. This is not a contribution heatmap and excludes private activity.',
  text(26, 83, 'Latest public events · excludes private activity', 15, '#6e819a') + (recent.length ? recent.map((event, i) => {
    const y = 118 + i * 39;
    return `<circle cx="31" cy="${y - 6}" r="4" fill="#61a3ff"/>` + text(49, y, actions[event.type] || event.type.replace(/Event$/, ''), 17, '#2e5e9e', 'font-weight="700"') + text(250, y, short(event.repo.name, 69), 17) + text(1173, y, event.created_at.slice(0, 10), 15, '#6e819a', 'text-anchor="end"');
  }).join('') : text(26, 135, 'No recent public events returned by GitHub.', 19)), date);

await mkdir(path.join(root, 'assets'), { recursive: true });
for (const [name, content] of Object.entries({ stats, languages, activity })) await writeFile(path.join(root, 'assets', `${name}.svg`), content);
console.log(`Updated public GitHub cards: ${repos.length} repositories, ${events.length} recent events.`);
