// The Usage tab: the tokens used by every project of every bucket, summed in the page from /data's `usage`
// (sessia/sessions/usage.py) at three levels: the account (a card per bucket), a bucket (a card per project) and a
// project (its own numbers). A breadcrumb goes back. The numbers of every level are the same pieces: Today, This week and
// This month as meters, the month's days, what counts and what doesn't, the active days and the share of each model.
// The plan strip is /data's `plan` (sessia/usage/__init__.py). Notes: sessia/usage/CLAUDE.md. Samples: samples.js.
import { useState } from '../vendor/hooks.js';
import { SPANS, ago, css, day, html, limitOf, plural, pretty, setLimit, split, tokens, warn } from '../core.js';
import { bucketColor } from '../panel/panel.js';

css(import.meta.url, 'usage.css');

export const ACCOUNT = 'account';  // the key of the account's own limits in `usageLimits`: no project's key (`<bucket>/<project>`) is without a `/`
const SORTS = [['month', 'this month'], ['week', 'this week'], ['today', 'today'], ['limit', 'share of its limit']];
const pct = (used, lim) => lim ? Math.round(100 * used / lim) : null;
const date = d => new Date(d + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// The projects of /data's `usage`: a key is `<bucket>/<project>`, and a project's name may hold a `/` too (a folder outside every bucket), so the first one splits.
const projects = usage => Object.entries(usage).map(([key, u]) => ({ key, u, bucket: key.slice(0, key.indexOf('/')), name: key.slice(key.indexOf('/') + 1) }));

// What a set of projects used altogether, with its limits: the account's own (`account`, typed here), a bucket's or a project's the sum of its
// projects' (kept per project, as the card on a column's name sets them), only when every project has one.
export function agg(items, account, lim = limitOf) {
  const a = { n: items.length, today: 0, week: 0, month: 0, days: {}, models: {},
    dToday: { in: 0, out: 0, write: 0, read: 0, answers: 0, sessions: 0 }, dMonth: { in: 0, out: 0, write: 0, read: 0, answers: 0 } };
  for (const { u } of items) {
    a.today += u.today; a.week += u.week; a.month += u.month;
    for (const [d, n] of Object.entries(u.detail.days)) a.days[d] = (a.days[d] ?? 0) + n;
    for (const [m, n] of Object.entries(u.detail.models)) a.models[m] = (a.models[m] ?? 0) + n;
    for (const k in a.dToday) a.dToday[k] += u.detail.today[k] ?? 0;
    for (const k in a.dMonth) a.dMonth[k] += u.detail.month[k] ?? 0;
  }
  a.lim = Object.fromEntries(SPANS.map(([span]) => [span, account ? lim(ACCOUNT)[span] ?? 0
    : items.every(p => lim(p.key)[span]) ? items.reduce((n, p) => n + lim(p.key)[span], 0) : 0]));
  return a;
}
export const topPct = a => Math.max(pct(a.today, a.lim.day) ?? -1, pct(a.week, a.lim.week) ?? -1);  // -1: no limit to be near
const val = (a, k) => k === 'limit' ? topPct(a) : a[k];
const biggest = (rows, sort, get) => [...rows].sort((x, y) => val(get(y), sort) - val(get(x), sort));

const meter = (label, used, lim) => {
  const p = pct(used, lim);
  return html`<div class=${'u-meter ' + warn(p)} style=${`--p: ${Math.min(p ?? 0, 100)}`}><span class="u-label">${label}</span><span class="u-val">${tokens(used)}</span>
    <span class="u-of">${lim ? `of ${tokens(lim)} · ${p}%` : 'no limit'}</span><span class="u-bar"></span></div>`;
};
const mini = a => { const p = Math.min(Math.max(topPct(a), 0), 100); return html`<span class=${'x-mini ' + warn(topPct(a))} style=${`--p: ${p}`}></span>`; };

// The days of this month so far, as the Mac's local days that usage.py keys them by.
const monthDays = () => { const now = new Date(); return Array.from({ length: now.getDate() }, (_, i) => day(new Date(now.getFullYear(), now.getMonth(), i + 1))); };

// The month's days as bars (today darker, a day over 80% or 90% of the daily limit orange or red, the limit a dashed line), with the day numbers under them.
function Days({ a, ht = 120, limit = 0 }) {
  const days = monthDays(), top = Math.max(1, ...days.map(d => a.days[d] ?? 0), limit);
  return html`<div class="x-days" style=${`--ht: ${ht}px`} role="img" aria-label="Tokens used each day this month">${days.map((d, i) => html`<i key=${d}
      class=${[limit && warn(100 * (a.days[d] ?? 0) / limit), i === days.length - 1 && 'now'].filter(Boolean).join(' ')} style=${`--h: ${(a.days[d] ?? 0) / top}`}
      title=${`${date(d)} · ${tokens(a.days[d] ?? 0)}`}></i>`)}${limit ? html`<b class="u-line" style=${`--h: ${limit / top}`}></b>` : ''}</div>
    <div class="x-axis" aria-hidden="true">${days.map((d, i) => html`<span key=${d}>${i === 0 || (i + 1) % 5 === 0 || i === days.length - 1 ? i + 1 : ''}</span>`)}</div>`;
}
const spark = (a, color) => { const days = monthDays(), top = Math.max(1, ...days.map(d => a.days[d] ?? 0));
  return html`<div class="x-spark" style=${`--k: ${color}`} aria-hidden="true">${days.map((d, i) => html`<i key=${d} class=${i === days.length - 1 ? 'now' : ''} style=${`--h: ${(a.days[d] ?? 0) / top}`}></i>`)}</div>`; };

function Stats({ a }) {
  const active = Object.entries(a.days).filter(([, n]) => n), busiest = [...active].sort((x, y) => y[1] - x[1])[0];
  return html`<dl class="u-stats"><dt>Today</dt><dd>${plural(a.dToday.sessions, 'session')} · ${plural(a.dToday.answers, 'answer')}</dd>
    <dt>This month</dt><dd>${plural(active.length, 'active day')}${active.length ? ` · ${tokens(a.month / active.length)} a day` : ''}</dd>
    ${busiest && html`<dt>Busiest day</dt><dd>${date(busiest[0])} · ${tokens(busiest[1])}</dd>`}</dl>`;
}
// What counts towards the totals, and in a grey box what doesn't (the cache reads), today and this month.
const Counted = ({ a }) => html`<table class="u-split"><thead><tr><th scope="col">Counted</th><th scope="col">Today</th><th scope="col">This month</th></tr></thead><tbody>
    ${split([['Input', 'in'], ['Output', 'out'], ['Cache written', 'write']], a.dToday, a.dMonth)}
    <tr class="u-total"><th scope="row">Total</th><td>${tokens(a.today)}</td><td>${tokens(a.month)}</td></tr></tbody></table>
  <table class="u-split u-skip"><thead><tr><th scope="col">Not counted</th><th scope="col"><span class="u-hide">Today</span></th><th scope="col"><span class="u-hide">This month</span></th></tr></thead>
    <tbody>${split([['Cache read', 'read']], a.dToday, a.dMonth)}</tbody></table>`;
function Models({ a }) {
  const shares = Object.entries(a.models).sort((x, y) => y[1] - x[1]).filter(([, v]) => a.month && v / a.month >= .01);
  return html`<div class="u-models">${shares.map(([k, v]) => html`<i key=${k} class=${'m-' + k} style=${`flex: ${v}`}></i>`)}</div>
    <p class="u-legend">${shares.map(([k, v]) => html`<span key=${k}><i class=${'m-' + k}></i>${k[0].toUpperCase() + k.slice(1)} ${Math.round(100 * v / a.month)}%</span>`)}</p>
    <p class="x-note">This month only: the page keeps each project's models as one month total.</p>`;
}

// The plan's own percentages as Claude Code last read them (~/.claude.json): of the plan, never tokens. A window is null when the file has no reading
// of it, and draws nothing; one whose reset time has passed draws no percent and no bar either, since the old percent says nothing about the new window.
function Plan({ plan }) {
  if (!plan) return null;
  const hm = ms => { const m = Math.ceil(ms / 60000); return `${m >= 60 ? Math.floor(m / 60) + ' h ' : ''}${m % 60} min`; };
  const part = (name, w, resets) => {
    if (!w) return null;
    const left = w.resetsAt * 1000 - Date.now();
    return left > 0 ? html`<span>${name} <b>${Math.round(w.percent)}%</b><i class="pbar" style=${`--p: ${Math.min(w.percent, 100)}`}></i>${resets(w, left)}</span>`
      : html`<span>${name} reset since, no new reading yet</span>`;
  };
  return html`<div class="x-plan"><span>Your plan</span>
    ${part('5-hour window', plan.fiveHour, (w, left) => `resets in ${hm(left)}`)}
    ${part('Weekly', plan.sevenDay, w => `resets ${new Date(w.resetsAt * 1000).toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`)}
    <span class="age" title="Claude Code's own cache on this Mac (~/.claude.json): percentages of the plan, never token counts, as of the last time Claude Code asked">% of the plan, not tokens · as of ${ago(plan.fetchedAt * 1000)}</span></div>`;
}

// The account's own limits, typed like a project's (parseTokens() in core.js).
const AccountLimits = ({ lim }) => html`<div class="u-limits x-limits">${SPANS.map(([span, , , label]) => html`<label>Account ${label.toLowerCase()}<input inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="none"
    defaultValue=${lim(ACCOUNT)[span] ? tokens(lim(ACCOUNT)[span]) : ''} onChange=${e => setLimit(ACCOUNT, span, e.currentTarget)}/></label>`)}
  <p>Tokens, like 40M or 500k; a week starts on Monday. Kept in this browser. A bucket's limit is the sum of its projects', drawn only when every project in it has one.</p></div>`;

// `from` is the level it opens at and `lim` where the limits are read from: the gallery's samples set both.
export function tab({ usage, plan, buckets, from = [], lim = limitOf }) {
  const [path, setPath] = useState(from), [sort, setSort] = useState('month');  // [] the account, [bucket], [bucket, project's key]
  const all = projects(usage);
  if (!all.length) return html`<div class="usage-tab"><${Plan} plan=${plan}/><p class="empty">No tokens used yet this month.</p></div>`;
  const level = path.length === 2 && all.some(p => p.key === path[1]) ? 2 : path.length >= 1 && all.some(p => p.bucket === path[0]) ? 1 : 0;
  const at = path.slice(0, level), color = b => bucketColor(buckets, b);
  const of = p => agg([p], false, lim), ofBucket = b => agg(all.filter(p => p.bucket === b), false, lim);
  const names = [...new Set(all.map(p => p.bucket))];
  const items = level === 0 ? all : level === 1 ? all.filter(p => p.bucket === at[0]) : all.filter(p => p.key === at[1]);
  const a = agg(items, level === 0, lim), acc = agg(all, true, lim);
  const crumbs = [['Account', []], ...(level >= 1 ? [[pretty(at[0]), [at[0]]]] : []), ...(level === 2 ? [[all.find(p => p.key === at[1]).name, at]] : [])];
  const project = (p, y) => html`<div class="x-card b-card" key=${p.key}><button type="button" class="b-cardhead" onClick=${() => setPath([p.bucket, p.key])}><span class="nm">${p.name}</span><span class="mo">${tokens(y.month)}</span></button>
    <div class="u-meters">${meter('Today', y.today, y.lim.day)}${meter('This week', y.week, y.lim.week)}</div>${spark(y, color(p.bucket))}</div>`;
  const cards = level === 0 ? biggest(names, sort, ofBucket).map(b => {
    const x = ofBucket(b), ps = biggest(all.filter(p => p.bucket === b), sort, of);
    return html`<div class="x-card b-card" key=${b}><button type="button" class="b-cardhead" onClick=${() => setPath([b])}><i class="dot" style=${`background: ${color(b)}`}></i><span class="nm">${pretty(b)}</span>
      <span class="x-muted">${plural(x.n, 'project')}</span><span class="mo">${tokens(x.month)}</span></button>
      <div class="u-meters">${meter('Today', x.today, x.lim.day)}${meter('This week', x.week, x.lim.week)}</div>${spark(x, color(b))}
      <div class="b-plist">${ps.slice(0, 3).map(p => { const y = of(p); return html`<button type="button" key=${p.key} onClick=${() => setPath([b, p.key])}><span>${p.name}</span><span>${tokens(y.month)}</span>${mini(y)}</button>`; })}
        ${ps.length > 3 && html`<button type="button" class="more" onClick=${() => setPath([b])}>+ ${ps.length - 3} more · open ${pretty(b)}</button>`}</div></div>`;
  }) : level === 1 ? biggest(items, sort, of).map(p => project(p, of(p))) : null;
  return html`<div class="usage-tab">
    <${Plan} plan=${plan}/>
    ${level > 0 && html`<div class="b-acct"><span>Whole account</span><span>today <b>${tokens(acc.today)}</b></span><span>this week <b>${tokens(acc.week)}</b></span><span>this month <b>${tokens(acc.month)}</b></span></div>`}
    <div class="b-crumbs" role="navigation" aria-label="Where you are">${crumbs.map(([n, p], i) => i === crumbs.length - 1 ? html`<span class="here" key=${n} aria-current="page">${n}</span>`
      : html`<span key=${n}><button type="button" onClick=${() => setPath(p)}>${n}</button><span class="x-muted"> ›</span></span>`)}</div>
    <div class="b-now">${meter('Today', a.today, a.lim.day)}${meter('This week', a.week, a.lim.week)}
      <div class="u-meter" style="--p: 0"><span class="u-label">This month</span><span class="u-val">${tokens(a.month)}</span><span class="u-of">${plural(a.n, 'project')}</span></div></div>
    ${level === 0 && html`<${AccountLimits} lim=${lim}/>`}
    ${level === 2 && html`<p class="x-note">This project's limits are set on its numbers, at the right end of its column's name on any tab.</p>`}
    <div class="b-detail"><div class="x-card"><h3>The month's days · ${level === 0 ? 'The whole account' : level === 1 ? pretty(at[0]) : crumbs[2][0]}</h3>
        <${Days} a=${a} limit=${a.lim.day}/><${Stats} a=${a}/></div>
      <div class="x-card"><${Counted} a=${a}/><div class="x-gap"></div><${Models} a=${a}/></div></div>
    ${cards && html`<div class="x-row x-cards"><h3>${level === 0 ? 'Buckets' : `Projects in ${pretty(at[0])}`}</h3><span class="grow"></span>
      <label class="x-muted">Biggest by <select aria-label="Sort by" value=${sort} onChange=${e => setSort(e.currentTarget.value)}>${SORTS.map(([k, n]) => html`<option value=${k} key=${k}>${n}</option>`)}</select></label></div>
      <div class="b-grid">${cards}</div>`}
  </div>`;
}

// The tab's props from the page's state (main.js): every bucket's projects, shown or not, so the account is the whole Mac.
export const fromPage = page => ({ usage: page.data.usage ?? {}, plan: page.data.plan ?? null, buckets: page.data.buckets });
