// What every component of the page shares, as core.py is for the Python: `html` to write a component, the markdown of the
// reports, the search, byProject(), the columns of a tab, what each browser remembers (load(), save()), the keys of
// this system (mod, combo(), chord()), and `actions`, what a component asks of the page.
import { h } from './vendor/preact.js';
import htm from './vendor/htm.js';

// A component returns html`<div class=${x}>…</div>`: htm reads the template, Preact draws it and, on the next
// draw, changes only what changed, so an open fold, a selection or a focused menu stays as it is.
export const html = htm.bind(h);

// What a component asks of the page, which main.js fills in: draw again (`redraw`), read /data again (`refresh`, as after a
// priority was saved), show a tab and a bucket without remembering them (`show`, an ?issue= link's item), open a tab as a
// click in the menu does (`pickTab`), and pin or unpin a project's column (`pinProject`). On /gallery they do nothing.
export const actions = { redraw() {}, refresh() {}, show() {}, pickTab() {}, pinProject() {}, usage() {} };

// What each browser remembers (localStorage): the open tab, the buckets, the pins, the dismissed sessions, the compact
// view, the theme, the notifications switch and the ordering. A browser that refuses storage just forgets.
export function load(key, empty) { try { return JSON.parse(localStorage.getItem(key)) ?? empty; } catch { return empty; } }
export function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

// The word the page uses for what its bucket menu picks (a client folder, a single project, Sessia's own folder, or
// Other): the one place it is written for the user, so a different word is a change of this line.
export const BUCKETS = 'buckets';

// The keys: the system's own, detected once, ⌘ on a Mac and Ctrl elsewhere, and only that one, so what a hint shows is
// what works (a Mac's Ctrl+K and a PC's Windows key+K do nothing). The keydown handlers are in main.js.
export const isMac = /^Mac/.test(navigator.platform);
export const mod = isMac ? '⌘' : 'Ctrl';
export const combo = key => isMac ? `⌘${key}` : `Ctrl+${key}`;  // as a tip writes it
export const chord = e => (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey;
export const aria = key => `${isMac ? 'Meta' : 'Control'}+${key}`;  // as aria-keyshortcuts writes it

// A tab's own styles, next to its code: css(import.meta.url, 'scheduled.css') at the top of its module.
// `sheets` holds one promise per stylesheet, done when it has loaded or failed: main.js waits for them before its first draw,
// because a link added by script doesn't hold the page back, and the components would show unstyled until their css came.
export const sheets = [];
export function css(base, file) {
  const href = new URL(file, base).pathname;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
  sheets.push(new Promise(done => { link.onload = link.onerror = done; }));
  document.head.append(link);
}

// The bits of markdown the reports use: **bold**, `code` and [links](…), shown as text.
export const md = s => String(s ?? '').split(/(\*\*.+?\*\*|`.+?`|\[.+?\]\(.+?\))/).map((p, i) => i % 2 === 0 ? p
  : p[0] === '*' ? html`<b>${md(p.slice(2, -2))}</b>` : p[0] === '`' ? html`<code>${p.slice(1, -1)}</code>` : md(p.slice(1, p.indexOf(']('))));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// How long ago a time was: dur() says '<1m', '5m', '2h 10m' or '3d', and ago() 'just now' or '5m ago'.
export function dur(t) {
  const m = Math.floor((Date.now() - new Date(t)) / 60000);
  if (!(m >= 1)) return '<1m';
  if (m < 60) return m + 'm';
  if (m < 1440) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  return Math.floor(m / 1440) + 'd';
}
export const ago = t => dur(t) === '<1m' ? 'just now' : dur(t) + ' ago';

// Search: every word typed in the box in the header has to appear, in any case.
export const hit = (query, ...fields) => { const text = fields.join(' ').toLowerCase(); return query.toLowerCase().split(/\s+/).every(w => text.includes(w)); };
// A list of repos that each hold items (key): with a search, the repos keep the items that match (f), and those with none go.
export const narrowIn = (query, repos, key, f) => query.trim()
  ? repos.map(r => ({ ...r, [key]: r[key].filter(x => f(r, x)) })).filter(r => r[key].length) : repos;
// ▶️ on a TODO, bug or scheduled item: a new Claude session in its repo's VS Code window, with the item in its input box.
// `item` names it for the server (kind, bucket, repo, title, and group or number). `issue` is its GitHub issue, if it has one,
// and `me` this Mac's GitHub login (/data's `login`): only the issue's assignee's sessions build an assigned item
// (.claude/on-demand/issues.md, "Leave alone"), so anyone else is asked first, and so is anyone when `me` can't be read.
// `runs` are the running sessions that started from the item (/data's notes.todo, taken() in sessions/): asked about first too.
export async function start(button, item, issue, me, runs) {
  if (runs?.length && !confirm(`A session that started from this item is still running: ${runs.map(r => `“${r.title}”${r.createdAt ? `, started ${ago(r.createdAt)}` : ''}`).join('; ')}.`
    + '\n\nTwo sessions on one item do the same work twice. Start another one anyway?')) return;
  const who = issue && (issue.name ?? issue.login), login = issue?.login ?? '';
  const mine = login && me && login.toLowerCase() === me.toLowerCase();
  if (who && !mine && !confirm(`This item belongs to ${who}${login ? ` (${login})` : ''}: its GitHub issue #${issue.number} is assigned to them, and `
    + (me ? `this Mac is signed in to GitHub as ${me}.` : "the dashboard couldn't read which GitHub account this Mac uses.")
    + '\n\nOnly the assignee\'s sessions build an assigned item. Start a session on it anyway?')) return;
  const label = button.firstChild;  // the button's own text, so a redraw in between finds it as it left it
  label.data = '⏳';
  const r = await fetch('/start?' + new URLSearchParams(item), { method: 'POST' }).catch(() => null);
  if (r?.status === 409) alert("Couldn't start the session: " + await r.json().catch(() => r.status));
  label.data = '▶️';
}

// + after a project's name: a new, empty Claude session in that project's VS Code window.
export async function newSession(button, bucket, repo) {
  button.disabled = true;
  const r = await fetch('/new-session?' + new URLSearchParams({ bucket, repo }), { method: 'POST' }).catch(() => null);
  if (r?.status === 409) alert("Couldn't start the session: " + await r.json().catch(() => r.status));
  button.disabled = false;
}

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

// The tokens a project's sessions used: "125k/3.5M" (today/this month) at the right end of a column's name, shown while the
// pointer is on the name, and by itself, orange, from 80% of a daily or weekly limit, red from 90%. Pointing at it opens its
// card in the page's tooltip (showTip() in main.js), which stays while the pointer is on it: meters against the limits, the
// month's days, the stats and the two limits to set. /data's `usage[<bucket>/<project>]`
// (sessia/sessions/usage.py); the limits are this browser's (load(), save()). Notes: sessia/sessions/CLAUDE.md.
css(import.meta.url, 'sessions/usage.css');
export const tokens = n => n >= 9.995e8 ? `${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`;
export const usageText = u => `${tokens(u.today)}/${tokens(u.month)}`;
let limits = load('usageLimits', {});
export const limitOf = id => limits[id] ?? {};  // the limits set for a project (`<bucket>/<project>`) or, on the Usage tab, for the account (`account`: no project's key has no `/`)
// What a limit field holds: "2M", "500k", "1.5m" or "750000" tokens; 0 when empty (no limit), NaN for anything else.
export function parseTokens(s) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([km]?)\s*$/i.exec(s);
  return !s.trim() ? 0 : m ? Math.round(parseFloat(m[1].replace(',', '.')) * { '': 1, k: 1e3, m: 1e6 }[m[2].toLowerCase()]) : NaN;
}
// Today against the daily limit and this week (from Monday) against the weekly one; pct is null with no limit.
export const SPANS = [['day', 'today', 'Today', 'Daily limit'], ['week', 'week', 'This week', 'Weekly limit']];
const meters = (u, lim = {}) => SPANS.map(([span, key, label]) => ({ span, label, used: u[key] ?? 0, limit: lim[span] || 0,
  pct: lim[span] ? Math.round(100 * (u[key] ?? 0) / lim[span]) : null }));
export const warn = pct => pct >= 90 ? 'over' : pct >= 80 ? 'near' : '';
export const day = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;  // the Mac's local day, as usage.py keys them

// The numbers on a column's name. A click (or Enter) puts the cursor in the card's first limit field.
export function usageChip({ id, name, u, lim = limits[id] }) {
  const top = meters(u, lim).filter(m => m.pct != null).sort((a, b) => b.pct - a.pct)[0], level = top ? warn(top.pct) : '';
  return html`<span class="u-slot"><button type="button" class=${level ? 'usage ' + level : 'usage'}
    data-usage=${id} data-usage-name=${name} onClick=${() => document.querySelector('#tip input')?.focus()}
    aria-label=${`Tokens used by ${name}: ${tokens(u.today)} today, ${tokens(u.month)} this month${level ? `, ${top.pct}% of the ${top.span === 'day' ? 'daily' : 'weekly'} limit` : ''}`}
    >${level && html`<b class="u-pct">${top.pct}%</b>`}<span class="u-text">${usageText(u)}</span></button></span>`;
}

// The rows of the card's two tables: what counts towards the totals (input, output, cache written) and what doesn't (cache read), today and this month.
export const split = (rows, t, m) => rows.map(([label, k]) => html`<tr><th scope="row">${label}</th><td>${tokens(t[k])}</td><td>${tokens(m[k])}</td></tr>`);

// The card; its styles are in sessions/usage.css.
export function usageCard({ id, name, u, lim = limits[id] ?? {} }) {
  const { today: t, month: m, days, models } = u.detail, now = new Date(), today = day(now);
  const month = Array.from({ length: now.getDate() }, (_, i) => { const d = day(new Date(now.getFullYear(), now.getMonth(), i + 1)); return [d, days[d] ?? 0]; });
  const active = month.filter(([, n]) => n), busiest = [...active].sort((a, b) => b[1] - a[1])[0], top = Math.max(1, ...month.map(([, n]) => n), lim.day || 0);
  const shares = Object.entries(models).sort((a, b) => b[1] - a[1]).filter(([, v]) => u.month && v / u.month >= .01);
  const date = d => new Date(d + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return html`<div class="ucard">
    <header><span class="u-name">${name}</span><span class="u-sub">tokens used</span></header>
    <div class="u-meters">${meters(u, lim).map(m => html`<div class=${'u-meter ' + warn(m.pct)} style=${`--p: ${Math.min(m.pct ?? 0, 100)}`}>
      <span class="u-label">${m.label}</span>
      <span class="u-val">${tokens(m.used)}</span><span class="u-of">${m.limit ? `of ${tokens(m.limit)}` : 'no limit'}</span><span class="u-bar"></span></div>`)}</div>
    <div class="u-days" role="img" aria-label="Tokens used each day this month">${month.map(([d, n]) => html`<i class=${[lim.day && warn(100 * n / lim.day), d === today && 'now'].filter(Boolean).join(' ')}
      style=${`--h: ${n / top}`}></i>`)}${lim.day ? html`<b class="u-line" style=${`--h: ${lim.day / top}`}></b>` : ''}</div>
    <dl class="u-stats"><dt>Today</dt><dd>${plural(t.sessions, 'session')} · ${plural(t.answers, 'answer')}</dd></dl>
    <table class="u-split"><thead><tr><th scope="col">Counted</th><th scope="col">Today</th><th scope="col">This month</th></tr></thead><tbody>
      ${split([['Input', 'in'], ['Output', 'out'], ['Cache written', 'write']], t, m)}
      <tr class="u-total"><th scope="row">Total</th><td>${tokens(u.today)}</td><td>${tokens(u.month)}</td></tr></tbody></table>
    <table class="u-split u-skip"><thead><tr><th scope="col">Not counted</th><th scope="col"><span class="u-hide">Today</span></th><th scope="col"><span class="u-hide">This month</span></th></tr></thead>
      <tbody>${split([['Cache read', 'read']], t, m)}</tbody></table>
    <dl class="u-stats">
      <dt>This month</dt><dd>${plural(active.length, 'active day')}${active.length ? ` · ${tokens(u.month / active.length)} a day` : ''}</dd>
      ${busiest && html`<dt>Busiest day</dt><dd>${date(busiest[0])} · ${tokens(busiest[1])}</dd>`}
    </dl>
    ${shares.length > 0 && html`<div class="u-models">${shares.map(([k, v]) => html`<i class=${'m-' + k} style=${`flex: ${v}`}></i>`)}</div>
      <p class="u-legend">${shares.map(([k, v]) => html`<span><i class=${'m-' + k}></i>${k[0].toUpperCase() + k.slice(1)} ${Math.round(100 * v / u.month)}%</span>`)}</p>`}
    <div class="u-limits">
      ${SPANS.map(([span, , , label]) => html`<label>${label}<input inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="none"
        defaultValue=${lim[span] ? tokens(lim[span]) : ''} onChange=${e => setLimit(id, span, e.currentTarget)}/></label>`)}
      <p>Tokens, like 2M or 500k; a week starts on Monday. From 80% of a limit the numbers show by themselves, in orange, and from 90% in red.</p>
    </div>
  </div>`;
}
export function setLimit(id, span, input) {
  const n = parseTokens(input.value);
  if (Number.isNaN(n)) { input.value = limits[id]?.[span] ? tokens(limits[id][span]) : ''; return; }  // a typo: the field goes back
  limits = { ...limits, [id]: { ...limits[id], [span]: n || undefined } };
  save('usageLimits', limits);
  actions.redraw();
}

const INFO = html`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.2v.1"/></svg>`;
const PLUS = html`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>`;
const PIN = html`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.2 2.3l5.5 5.5-1.9.5-2.9 2.9.2 3.6-1.5 1.5-3.5-3.5-4.6 4.6-.9-.9 4.6-4.6-3.5-3.5 1.5-1.5 3.6.2 2.9-2.9z"/></svg>`;

// One column per project (`project` names the key that holds it): the pinned ones first, in the order they were pinned (the newest pin
// last of them, so pinning one never moves another pinned column), then the rest A to Z. `card` draws one item. `lit(items)` says how far into its gold glow the column's name is (ms), or null
// (the Claude sessions tab); `head(name, items)` adds to the name's row (Open all on the Closed sessions tab). The pin asks the
// page (actions.pinProject), which keeps the pins, so every tab moves together.
export function byProject({ list, project, card, picked, pinned, facts, lit, head }) {
  const groups = Object.groupBy(list, x => whose(picked, x.bucket, x[project]));
  const pin = g => groups[g][0][project];  // a pin is by the repo's own name, so it holds however many buckets are picked
  const rank = g => pinned.includes(pin(g)) ? pinned.indexOf(pin(g)) : Infinity;
  return Object.keys(groups).sort().sort((a, b) => rank(a) - rank(b)).map(g => {
    const on = pinned.includes(pin(g)), why = whyColumn(facts, groups[g][0].bucket, pin(g)), glow = lit?.(groups[g]);
    const id = `${groups[g][0].bucket}/${pin(g)}`, use = actions.usage(id);
    return html`<section key=${g}><h2 class=${'col' + (glow == null ? '' : ' glow')} style=${glow == null ? undefined : `animation-delay: -${glow}ms`}><span class="pname">${g}</span>${why && html`<button type="button" class="info" data-lines aria-label="Why this column is not a project" title=${why}>${INFO}</button>`}<button
      class="pin" data-pin-project=${pin(g)} onClick=${() => actions.pinProject(pin(g))} aria-pressed=${on} title=${on ? 'Unpin' : 'Pin to the left, in every tab'}>${PIN}</button>${!why && html`<button type="button"
      class="new" onClick=${e => newSession(e.currentTarget, groups[g][0].bucket, pin(g))} title="New empty session in ${pin(g)}" aria-label="New empty session in ${pin(g)}">${PLUS}</button>`}${head?.(g, groups[g])}${use && usageChip({ id, name: g, u: use })}</h2>${groups[g].map(card)}</section>`;
  });
}
