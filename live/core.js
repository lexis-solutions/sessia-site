// What every tab's components share, as core.py is for the Python: `html` to write a component, the markdown of the
// reports, the search, and byProject(), the columns of a tab. Each function that dashboard.html also has (md(), ago(),
// narrowIn(), whose(), whyColumn(), byProject()) does the same there, for the tabs not moved yet; the copy there goes with the last one.
import { h } from './vendor/preact.js';
import htm from './vendor/htm.js';

// A component returns html`<div class=${x}>…</div>`: htm reads the template, Preact draws it and, on the next
// draw, changes only what changed, so an open fold, a selection or a focused menu stays as it is.
export const html = htm.bind(h);

// A tab's own styles, next to its code: css(import.meta.url, 'scheduled.css') at the top of its module.
export function css(base, file) {
  const href = new URL(file, base).pathname;
  if (!document.querySelector(`link[href="${href}"]`)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
}

// The bits of markdown the reports use: **bold**, `code` and [links](…), shown as text.
export const md = s => String(s ?? '').split(/(\*\*.+?\*\*|`.+?`|\[.+?\]\(.+?\))/).map((p, i) => i % 2 === 0 ? p
  : p[0] === '*' ? html`<b>${md(p.slice(2, -2))}</b>` : p[0] === '`' ? html`<code>${p.slice(1, -1)}</code>` : md(p.slice(1, p.indexOf(']('))));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// How long ago a time was: dur() says '<1m', '5m', '2h 10m' or '3d', and ago() 'just now' or '5m ago'.
function dur(t) {
  const m = Math.floor((Date.now() - new Date(t)) / 60000);
  if (!(m >= 1)) return '<1m';
  if (m < 60) return m + 'm';
  if (m < 1440) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  return Math.floor(m / 1440) + 'd';
}
export const ago = t => dur(t) === '<1m' ? 'just now' : dur(t) + ' ago';

// Search: every word typed in the box at the top of the left panel has to appear, in any case.
export const hit = (query, ...fields) => { const text = fields.join(' ').toLowerCase(); return query.toLowerCase().split(/\s+/).every(w => text.includes(w)); };
// A list of repos that each hold items (key): with a search, the repos keep the items that match (f), and those with none go.
export const narrowIn = (query, repos, key, f) => query.trim()
  ? repos.map(r => ({ ...r, [key]: r[key].filter(x => f(r, x)) })).filter(r => r[key].length) : repos;
export const empty = (query, text) => html`<p class="empty">${query.trim() ? `Nothing matches “${query.trim()}”.` : text}</p>`;

export const pretty = name => name === 'Other' ? name : name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
// With several buckets picked, a repo's name says whose it is (two clients can both have a `workspace`), except a
// single project's, which is named after its bucket.
export const whose = (picked, b, repo) => picked.length > 1 && repo !== b ? `${pretty(b)} · ${repo}` : repo;

// A red info icon after a column's name says why the column is there, but only for a column that is no project's
// own (Emil Kirilov asked on 2026-11-20). A folder directly in Sessia's folder is a project when it has a CLAUDE.md,
// is a git repo or holds git repos (scan_buckets() in core.py), and a project's own columns are its repos', or a
// notes project's one (facts: /data's bucketFacts). '' for a column that is a project's own.
export function whyColumn(facts, bucket, repo) {
  const f = facts?.[bucket];
  if (f?.columns.includes(repo)) return '';
  const rule = 'A folder directly in Sessia\'s folder is a project when it has a CLAUDE.md, is a git repo or holds git repos.';
  if (repo.startsWith('.worktrees/')) return `${repo} is a branch's own folder (a worktree), not a project: its sessions are listed under ${bucket}, the project it belongs to.`;
  if (!f) return `${repo} is not a project: these sessions ran outside Sessia's folder, so no project of Sessia's owns them.\n\n${rule}`;
  if (f.own) return `${repo} is not a project: ${repo.split('/')[0]} has no CLAUDE.md, is no git repo and holds no git repos. Its sessions are listed under ${bucket} because they ran inside Sessia's folder.`;
  return `${repo === 'workspace' ? `${bucket}'s own folder` : repo} is not a project of its own: these sessions ran there, inside ${bucket}, so they are listed with it.\n\n${rule}`;
}

const INFO = html`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.2v.1"/></svg>`;
const PIN = html`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.2 2.3l5.5 5.5-1.9.5-2.9 2.9.2 3.6-1.5 1.5-3.5-3.5-4.6 4.6-.9-.9 4.6-4.6-3.5-3.5 1.5-1.5 3.6.2 2.9-2.9z"/></svg>`;

// One column per project (`project` names the key that holds it): the pinned ones first, the newest pin leftmost,
// then the rest A to Z. `card` draws one item. The pin is clicked through dashboard.html's handler (data-pin-project),
// which keeps the pins, so the old tabs and these move together.
export function byProject({ list, project, card, picked, pinned, facts }) {
  const groups = Object.groupBy(list, x => whose(picked, x.bucket, x[project]));
  const pin = g => groups[g][0][project];  // a pin is by the repo's own name, so it holds however many buckets are picked
  const rank = g => pinned.includes(pin(g)) ? pinned.indexOf(pin(g)) : Infinity;
  return Object.keys(groups).sort().sort((a, b) => rank(a) - rank(b)).map(g => {
    const on = pinned.includes(pin(g)), why = whyColumn(facts, groups[g][0].bucket, pin(g));
    return html`<section key=${g}><h2>${g}${why && html`<button type="button" class="info" data-lines aria-label="Why this column is not a project" title=${why}>${INFO}</button>`}<button
      class="pin" data-pin-project=${pin(g)} aria-pressed=${on} title=${on ? 'Unpin' : 'Pin to the left, in every tab'}>${PIN}</button></h2>${groups[g].map(card)}</section>`;
  });
}
