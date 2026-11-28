// The Productivity tab: the hours report that productivity.py writes (productivity() in __init__.py): tiles of this
// month against the months before it, a heat map, a table of months, the month's days and how it was counted.
// Samples of each state are in samples.js, shown at /gallery.
import { useEffect, useState } from '../vendor/hooks.js';
import { ago, css, html, plural } from '../core.js';

css(import.meta.url, 'productivity.css');

export const hrs = x => x < 10 ? x.toFixed(1) : String(Math.round(x));
const MOMENTS = { prompt: 'prompt typed into a Claude session', merge: 'merge request you merged on GitHub or, before the move, GitLab', server: 'command typed on a server',
                  ssh: 'ssh login to a server from your terminal', slack: 'message in a Slack conversation with your client' };
const mins = m => m < 60 ? m + ' min' : m / 60 + ' h';
const hm = m => (m = Math.round(m)) < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : '');
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HEAT = [[0, 'no hours'], [2, 'under 2 h'], [4, '2 to 4 h'], [6, '4 to 6 h'], [Infinity, '6 h or more']];
const heatLevel = h => h ? HEAT.findIndex(([below]) => h < below) : 0;
const sum = (list, f) => list.reduce((n, m) => n + f(m), 0);

// How a month's hours add up: each kind of moment on its own, and Claude's rating of each commit made without Claude.
export function breakdown({ m }) {
  const kinds = m.breakdown.filter(b => b.count);
  return html`<div class="breakdown">
    <ul>${kinds.length ? kinds.map(b => html`<li key=${b.what}><span class="title">${b.what}</span><span>${plural(b.count, 'time')} · ${hrs(b.hours)} h</span></li>`) : html`<li>Nothing found.</li>`}</ul>
    <div class="note">Each kind counted on its own. Where they overlap the time counts once, so together they come to
      more than the month's ${hrs(m.hours)} h.</div>
    ${m.ratedCommits.length > 0 && html`<h2>Commits made without Claude, as Claude rated them</h2><ul>${m.ratedCommits.map(c => html`
      <li><span class="tag">${c.minutes == null ? 'not rated yet' : mins(c.minutes)}</span>
        <span>${c.subject} <span class="note">· ${c.repo}</span></span></li>`)}</ul>`}
  </div>`;
}

// How long 1, 2, 3… Claude sessions ran at once, from {how many: minutes}: a heading, then a bar each.
export function atOnceBars({ atOnce }) {
  const levels = Object.entries(atOnce ?? {}).map(([n, m]) => [Number(n), m]).filter(([, m]) => m >= 0.5);
  const running = levels.reduce((s, [, m]) => s + m, 0), top = Math.max(...levels.map(([, m]) => m));
  return running > 0 && html`<div class="at-once"><h3>Claude sessions running ${hm(running)}, ${(levels.reduce((s, [n, m]) => s + n * m, 0) / running).toFixed(1)} at once on average</h3>
    ${levels.map(([n, m]) => html`<div class="lv" key=${n}><span>${plural(n, 'session')}</span><span><i style=${`width:${m / top * 100}%`}></i></span>
      <span>${hm(m)}</span></div>`)}</div>`;
}

let heatDays = {};  // date -> the day's hours, the report's heat details and the merge requests merged: what dayCard() shows, set by heatmap()

// What the tooltip of a day in the heat map shows: showTip() in main.js draws it into the page's tooltip.
export function dayCard({ day: key }) {
  const d = heatDays[key] ?? {};
  // "64 commits", then a bullet per repo with its count, most first.
  const perRepo = (what, counts) => {
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]), all = list.reduce((s, [, n]) => s + n, 0);
    return all > 0 && html`<h3>${plural(all, what)}</h3><ul>${list.map(([repo, n]) => html`<li key=${repo}>${repo} ${n}</li>`)}</ul>`;
  };
  const merged = {};
  for (const x of d.mrs ?? []) merged[x.repo] = (merged[x.repo] ?? 0) + 1;
  const part = (cls, x) => x >= 0.05 && html`<span class=${cls} style=${`flex-grow:${x}`}>${hrs(x)}</span>`;
  return html`<b>${new Date(key + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b>
    ${d.hours ? html`<h3>Hours worked</h3><div class="hours"><span class="bar">${part('talk', d.communication)}${part('sessions', d.sessions)}${part('other', d.other)}</span>
      <span>${hrs(d.hours)} h</span></div>
      <div class="legend dim"><i class="talk"></i>communication<i class="sessions"></i>Claude sessions<i class="other"></i>other</div>`
      : html`<div>No hours counted</div>`}
    <${atOnceBars} atOnce=${d.atOnce}/>
    ${perRepo('commit', d.commits ?? {})}
    ${perRepo('merge request', merged)}`;
}

// The heat map right of the tiles, like the one on a GitHub profile: a square for each day of the months shown, a
// column for each week, darker for more hours. Pointing at a day, or the focus on it, shows dayCard() in the tooltip.
export function heatmap({ r, months }) {
  heatDays = {};
  for (const m of months) for (const d of m.days) heatDays[d.date] = { ...d, ...r.heat?.[d.date], mrs: [] };
  for (const m of months) for (const x of m.mrs) heatDays[isoDay(new Date(x.mergedAt * 1000))]?.mrs.push(x);
  const first = new Date(months.at(-1).month + '-01T00:00'), today = new Date();
  const monday = new Date(first.getFullYear(), first.getMonth(), 1 - (first.getDay() + 6) % 7);
  const cells = ['Mon', 'Wed', 'Fri'].map((d, i) => html`<span key=${d} style=${`grid-area:${2 * i + 2}/1`}>${d}</span>`);
  for (let i = 0; ; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i), col = Math.floor(i / 7) + 2;
    if (d > today) break;
    if (d.getDate() === 1) cells.push(html`<span key=${'m' + i} style=${`grid-area:1/${col}/2/span 3`}>${d.toLocaleDateString('en-GB', { month: 'short' })}</span>`);
    if (d < first) continue;
    const key = isoDay(d), day = heatDays[key] ?? {}, label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const worked = day.hours || day.commits || day.atOnce;
    cells.push(html`<span key=${key} class="h${heatLevel(day.hours)}" style=${`grid-area:${i % 7 + 2}/${col}`} data-day=${key}
      tabindex=${worked ? 0 : undefined} aria-label=${worked ? `${label}: ${hrs(day.hours ?? 0)} h` : undefined}></span>`);
  }
  return html`<div class="heat"><div class="heat-grid" style="grid-template-columns:24px">${cells}</div>
    <div class="note">less ${HEAT.map(([, what], i) => html`<span class="key h${i}" key=${i} title=${what}></span>`)} more</div></div>`;
}

const tile = (label, value, note) => html`<div class="tile">${label}<b>${value}</b><div class="note">${note}</div></div>`;

// The report productivity.py writes: this month first, then the months before it. Those of them shown are the benchmark.
export function productivityPanel({ r, shown, open, toggle }) {
  const months = r.months.slice(0, shown), [now, ...bench] = months;
  const avg = f => bench.length ? sum(bench, f) / bench.length : 0;
  const perDay = list => sum(list, m => m.hours) / Math.max(1, sum(list, m => m.activeDays));
  const works = k => !/^(not connected|failed)/.test(r.sources[k] ?? 'not connected');
  const talking = works('Slack messages') || works('Calendar meetings');
  const scale = Math.max(8, ...now.days.map(d => d.hours));
  const part = (cls, x) => x > 0 && html`<span class=${cls} style=${`width:${x / scale * 100}%`}></span>`;
  const atOnce = {};  // the month's minutes with 1, 2, 3… Claude sessions running
  for (const d of now.days) for (const [n, m] of Object.entries(r.heat?.[d.date]?.atOnce ?? {})) atOnce[n] = (atOnce[n] ?? 0) + m;
  const projects = Object.entries(now.projects).sort((a, b) => b[1] - a[1]);
  const rules = Object.entries(r.rules);
  const failed = Object.entries(r.sources).filter(([, v]) => v.startsWith('failed'));
  return html`
    ${failed.length > 0 && html`<p class="crash">⚠️ At the last count, ${failed.map(([k, v]) => `${k} ${v}`).join('; ')}.
      The hours may be off until a count works again.</p>`}
    <div class="tiles">
      ${tile(`Hours in ${now.label}`, hrs(now.hours), `${plural(now.activeDays, 'active day')} so far · benchmark ${hrs(avg(m => m.hours))} a month`)}
      ${tile('Hours per active day', hrs(perDay([now])), `benchmark ${hrs(perDay(bench))}`)}
      ${tile('Communication', talking ? hrs(now.communication) : '–',
        talking ? `hours · benchmark ${hrs(avg(m => m.communication))} a month` : 'Slack and the calendar aren\'t connected')}
      ${tile('Merge requests you merged', now.mrs.length, `benchmark ${Math.round(avg(m => m.mrs.length))} a month`)}
      ${tile('Commits', now.commits, `${now.byHand} without Claude · benchmark ${Math.round(avg(m => m.commits))} a month`)}
      <${heatmap} r=${r} months=${months}/>
    </div>
    <div class="table"><table>
      <tr><th>Month</th><th>Hours</th><th>Communication</th><th>Claude sessions</th><th>Other</th>
          <th>Active days</th><th>Hours per active day</th><th>Commits</th><th>Merged</th></tr>
      ${months.flatMap(m => [html`<tr key=${m.month}><td><button class="title" aria-expanded=${open.has(m.month)} title="How these hours add up"
          onClick=${() => toggle(m.month)}>${open.has(m.month) ? '▾' : '▸'} ${m.label}${m.current ? ' (so far)' : ''}</button></td><td>${hrs(m.hours)}</td>
        <td>${talking ? hrs(m.communication) : '–'}</td><td>${hrs(m.sessions)}</td><td>${hrs(m.other)}</td>
        <td>${m.activeDays}</td><td>${hrs(perDay([m]))}</td><td>${m.commits}</td><td>${m.mrs.length}</td></tr>`,
        open.has(m.month) && m.breakdown && html`<tr class="detail" key=${m.month + ' detail'}><td colspan="9"><${breakdown} m=${m}/></td></tr>`])}
    </table></div>
    <div class="grid">
      <section><h2>${now.label}, day by day</h2><div class="session">
        <div class="note legend"><i class="talk"></i>communication<i class="sessions"></i>Claude sessions<i class="other"></i>other</div>
        ${now.days.map(d => html`<div class="day ${d.hours ? '' : 'none'}" key=${d.date}>
          <span>${new Date(d.date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
          <span class="bar">${part('talk', d.communication)}${part('sessions', d.sessions)}${part('other', d.other)}</span>
          <span>${d.hours ? hrs(d.hours) : ''}</span>
        </div>`)}
        <${atOnceBars} atOnce=${atOnce}/>
      </div></section>
      <section>
        <h2>Claude session hours per project</h2><div class="session"><ul>${projects.length ? projects.map(([p, h]) => html`<li key=${p}><span class="title">${p}</span><span>${hrs(h)} h</span></li>`) : html`<li>None</li>`}</ul>
          <div class="note">Each project counts its own sessions, so time with two projects open counts in both.</div></div>
        <h2>You merged in ${now.label}</h2><div class="session">${now.mrs.length ? html`<details>
          <summary>${plural(now.mrs.length, 'merge request')}, newest first</summary>
          <ul>${now.mrs.map(x => html`<li key=${x.url}><span><a href=${x.url} target="_blank" rel="noopener">${x.ref || `!${x.iid}`} ${x.title}</a>
            <span class="tag">${x.repo}</span></span></li>`)}</ul></details>` : 'None'}</div>
      </section>
      <section><h2>How it's counted</h2><div class="session">
        Each moment that shows work stands for some minutes around it, and overlapping time counts once:
        <ul>${rules.map(([k, [before, after]]) => html`<li key=${k}>Each ${MOMENTS[k] ?? k}: ${before} minutes before it, ${after} after.</li>`)}
          <li>Each commit made without Claude: the work before it, as Claude rates it from its diff: ${(r.steps ?? []).map(mins).join(', ')}.</li>
          <li>Each Slack huddle with your client that you were in: from its start to its end, as communication.</li>
          <li>Each client meeting on your calendar: from its start to its end, as communication.</li></ul>
        <div class="note">Claude's own work doesn't count, nor do the commits it made: only your prompts and what you did
          yourself. A Slack conversation counts while its messages, your client's and yours, are at most 3 minutes apart, if you
          wrote in it. Communication is the Slack, huddle and meeting time, "Claude sessions" the prompt time that isn't also communication, and
          "other" the rest: commits without Claude, merges and work on the servers. The Claude transcripts start in
          September 2026, so earlier months rest on the other moments alone, and are rougher.</div>
        <div class="note">A finished month is saved for good once two counts in a row, with every source working,
          give it the same numbers. It isn't counted again after that.</div>
        <div class="note">At the last count: <ul>${Object.entries(r.sources).map(([k, v]) => html`<li key=${k}>${k}: ${v}</li>`)}</ul></div>
      </div></section>
    </div>`;
}

const MONTHS = [3, 4, 6, 9, 12];
const stored = () => { try { return MONTHS.includes(+localStorage.getItem('monthsShown')) ? +localStorage.getItem('monthsShown') : 4; } catch { return 4; } };

// The whole tab: the report, how many months of it, and Refresh, which asks for a new count (POST /productivity).
// The months chosen are kept in this browser; the months opened to their breakdown, until a reload.
export function tab({ productivity: p }) {
  const [shown, setShown] = useState(stored);
  const [open, setOpen] = useState(() => new Set());
  const [asked, setAsked] = useState(false);  // Refresh was clicked and the page doesn't know yet that the count runs
  useEffect(() => setAsked(false), [p]);  // /data changed: it says whether the count runs
  const counting = p.counting || asked, r = p.report;
  return html`
    <p class="intro">Hours on the client projects this month, next to the months before it, whose average is the benchmark. Nothing records working time, so they're estimated from your Claude prompts, the commits you made without Claude, the merge requests you merged, your work on the servers, your Slack conversations and huddles with your client and your client meetings (see "How it's counted"). Counted again every 2 hours, day and night.</p>
    <p class="summary"><select id="months-shown" aria-label="How many months to show" value=${shown} onChange=${e => {
        setShown(+e.target.value);
        try { localStorage.setItem('monthsShown', e.target.value); } catch {}
      }}>${MONTHS.map(n => html`<option value=${n} key=${n}>Last ${n} months</option>`)}</select>
      <button disabled=${counting} onClick=${async () => { setAsked(true); const r = await fetch('/productivity', { method: 'POST' }).catch(() => null); if (!r?.ok) setAsked(false); }}>Refresh</button>${' '}<span>${counting ? 'Counting…' : r ? `Counted ${ago(r.generatedAt * 1000)}` : ''}</span></p>
    ${r ? html`<${productivityPanel} r=${r} shown=${shown} open=${open}
      toggle=${m => setOpen(o => { const n = new Set(o); n.has(m) ? n.delete(m) : n.add(m); return n; })}/>`
      : html`<p class="empty">Not counted yet: click Refresh.</p>`}`;
}

// The tab's props from the page's state (main.js). The report is the one bucket's, so the page shows the tab only when that bucket is shown.
export const fromPage = page => ({ productivity: page.data.productivity ?? {} });
