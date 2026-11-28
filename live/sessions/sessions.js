// The Claude sessions and Closed sessions tabs: one card, `sessionCard()`, draws a session in both (sessions() in
// __init__.py), one column per project. Samples of each state are in samples.js, shown at /gallery.
// What the page keeps for these tabs (main.js: it saves them per browser and the menu's counts need them) comes in
// as props: the pinned sessions `pins`, the dismissed ones, the `order`, and `set(key, change)` to change one of them.
import { actions, ago, byProject, css, dur, empty, hit, html, md, newSession, plural, pretty, whose } from '../core.js';

css(import.meta.url, 'sessions.css');

const STATES = { busy: 'Working', waiting: 'Needs you', idle: 'Idle' };
// What each status emoji in a report means (CLAUDE.md, "The report at the end of every turn").
const STATUS = {
  '⏳': 'Waiting: it needs an answer or a decision from whoever the line names',
  '👀': 'Ready for your check: review, merge, deploy or try it',
  '🔄': 'In progress: started, or running in the background',
  '⏩': 'Up next: agreed, not started',
  '🗓': 'Later: due at a set time, listed on the Scheduled tab',
  '✅': 'Done',
  '🚫': 'Dropped on purpose',
  '🚚': 'Handed over: moved to a new session, see the TODO item it names',
};
const PIN = html`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.2 2.3l5.5 5.5-1.9.5-2.9 2.9.2 3.6-1.5 1.5-3.5-3.5-4.6 4.6-.9-.9 4.6-4.6-3.5-3.5 1.5-1.5 3.6.2 2.9-2.9z"/></svg>`;

// What Dismiss hides: this report and, for a session that stopped mid-work, its last work too, so working in it
// again lists it again. One closed with "close" is dismissed by its report alone. The menu's count of closed sessions uses it too.
export const version = s => [s.reportedAt, s.withoutClose && s.lastAt].filter(Boolean).join(' ');
// Handed-over work no session has picked up yet counts as open here: Dismiss all leaves it.
const hasOpenTasks = s => s.handedOver || s.tasks.some(t => t.open);

// The open cards of the compact view, until a reload.
export const expanded = new Set();
// While Open all opens one session after another: the project's name, and what its button says.
const opening = new Map();
const redraw = () => actions.redraw();

// When this was first drawn, for a key: an animation that starts when its element does carries on by itself, so its delay is
// worked out once. A redraw that changed it would make the animation jump.
const firstDrawn = new Map();
const first = key => { if (!firstDrawn.has(key)) firstDrawn.set(key, Date.now()); return firstDrawn.get(key); };

// A running session's conversation size, by the count of the hook that asks for a hand-over at the
// limits /data sends (.claude/hooks/model-advice.py): muted, amber from the soft limit, red from the hard one.
export function ctxTag(s, limits) {
  if (s.closed || !s.tokens || !limits) return '';
  const [soft, hard] = limits, k = n => Math.floor(n / 1000) + 'k';
  const level = s.tokens >= hard ? 'bad' : s.tokens >= soft ? 'warn' : '';
  return html`<span class="ctx ${level}" title="This conversation: ${k(s.tokens)} tokens. Every turn re-reads all of it, so from ${k(soft)} Claude is asked whether to hand over to a new session, and from ${k(hard)} it must.">${k(s.tokens)}</span> `;
}

// Open: this session's VS Code window and tab. The button says "Opening…" meanwhile (its own text, which a redraw leaves as it is).
async function openSession(button, id) {
  const label = button.firstChild, was = label.data;
  label.data = 'Opening…';
  const r = await fetch('/open?session=' + encodeURIComponent(id), { method: 'POST' }).catch(() => null);
  label.data = was;  // the card stays across a redraw, which leaves this text as it is
  if (!r?.ok) alert("Couldn't open the session: " + (r ? await r.json().catch(() => r.status) : "the dashboard didn't answer"));
}

// Under a closed session's 🚚 task: the session that picked it up, or that none has yet.
export const pickup = (s, t) => !s.closed || t.emoji !== '🚚' ? ''
  : t.pickedUp ? html` <button type="button" onClick=${e => openSession(e.currentTarget, t.pickedUp)} title="Open the session that picked this up">Picked up: Open</button>`
  : html` <span class="tag warn" title="No later session has started with this prompt or its TODO.md item yet.">not picked up yet</span>`;

// Session id -> when its gold glow started; null while the notification that asked for it is unseen (the page hidden or
// on another tab), so the glow plays when it is looked at. Emil Kirilov asked on 2026-11-18. sessia/header/notify.js owns the
// object (tell() fills it), and a card's draw starts and ends a glow in it. GLOW_MS is the length of the .glow animations.
const GLOW_MS = 8000;
// When the newest glow among `list` started, or null.
function glowing({ glowAt, shown }, list) {
  let start = null;
  for (const x of list) {
    if (!(x.id in glowAt)) continue;
    if (glowAt[x.id] === null && !document.hidden && shown) glowAt[x.id] = Date.now();
    if (glowAt[x.id] === null) continue;
    if (Date.now() - glowAt[x.id] >= GLOW_MS) delete glowAt[x.id];
    else start = Math.max(start ?? 0, glowAt[x.id]);
  }
  return start;
}
// How far into its glow the list is, as the animation's delay when it is first drawn: that stays the same on a redraw.
const lit = (page, key, list) => { const start = glowing(page, list); return start === null ? null : first(`${key} ${start}`) - start; };

// What a card says first: its state's class and word, and `line`, the one line worth reading, which is the task
// `lead` when it comes from the status list. A session needs you when it waits on a question or a permission, or when
// its turn ended on a report with a ⏳ line; it is done when that report is 🟢. Both go by `ended`, as the notifications do
// (watch() in sessia/header/notify.js): it is empty once the session works on, so an older report's lines don't count.
export function status(s) {
  // The task's emoji is an element with its own tooltip, as in the list under the card (Emil Kirilov, 2026-11-19: the first icon had none).
  const task = e => s.tasks.find(t => t.emoji === e), show = t => t
    ? html`<span class="task"><span class="emoji" title=${STATUS[t.emoji]}>${t.emoji}</span><span>${md(t.text)}</span></span>` : 'No status list yet';
  if (s.closed) return { cls: 'closed', word: 'Closed', line: `Closed${s.withoutClose ? ' mid-work' : s.handedOver ? ', handed over' : ''}, active ${ago(s.lastAt)}` };
  if (s.state === 'waiting') return { cls: 'needs', word: STATES.waiting,
    line: s.wants === 'Question' ? 'A question waits for your answer in its tab' : 'A permission waits for your OK in its tab' };
  const next = s.tasks.find(t => t.open) ?? s.tasks[0];
  if (s.state === 'busy') {
    const step = s.steps?.at(-1), lead = step ? null : task('🔄') ?? next;
    return { cls: 'busy', word: STATES.busy, line: step ? step : show(lead), lead };
  }
  const ask = s.ended && task('⏳'), lead = ask || (task('👀') ?? next);
  if (ask) return { cls: 'needs', word: STATES.waiting, line: html`Decision: ${md(ask.text.replace(/^You:\s*/, ''))}`, lead };
  if (s.ended?.startsWith('🟢')) return { cls: 'done', word: 'Done', line: lead ? show(lead) : 'Nothing left to do', lead };
  return { cls: 'idle', word: STATES[s.state] ?? s.state, line: show(lead), lead };
}

// A card's ring: the progress as an arc in the state's colour, with a beating dot while the session works (a
// turning arc when it has no count of steps), and a blinking text cursor while it is idle, waiting for your next
// message; an outlined circle with ! when it needs you or is closed, with a tick when it is done. The animations' delays
// start them where the clock says (`at`: the ring's own time, from first()), so the arc turns, the dot beats and the cursor
// blinks in step on every card (Emil Kirilov picked the cursor on 2026-11-21 from five drawn for him). The lengths in `at()`
// are the ones of `.ring .spin`, `.beat` and `.blink` in sessions.css.
export function ring(s, st, since = Date.now()) {
  const disc = mark => html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--st)" stroke-width="1.8"/>
    <path d=${mark} fill="none" stroke="var(--st)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (st.cls === 'needs' || st.cls === 'closed') return disc('M12 6.6v6.6M12 16.9v.2');
  if (st.cls === 'done') return disc('M7.4 12.4l3.1 3 6.1-6.4');
  const at = ms => `animation-delay: -${since % ms}ms`;
  const around = 2 * Math.PI * 9, turning = st.cls === 'busy' && !s.progress;
  const part = turning ? .28 : s.progress ? Math.min(1, s.progress[0] / s.progress[1]) || 0 : 0;
  return html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--line)" stroke-width="2.6"/>
    ${part ? html`<g class=${turning ? 'spin' : undefined} style=${turning ? at(1100) : undefined}><circle cx="12" cy="12" r="9" fill="none" stroke="var(--st)" stroke-width="2.6" stroke-linecap="round"
      stroke-dasharray="${part * around} ${around}" transform="rotate(-90 12 12)"/></g>` : ''}
    ${st.cls === 'busy' ? html`<circle class="beat" style=${at(1200)} cx="12" cy="12" r="3.2" fill="var(--st)"/>` : ''}
    ${st.cls === 'idle' ? html`<rect class="blink" x="11.15" y="7.6" width="1.7" height="8.8" rx=".85" fill="var(--muted)" style=${at(1100)}/>` : ''}</svg>`;
}

// `s.progress` ([done, total], the session's own count) and `s.steps` (its turn's last steps, the newest last)
// are sent only once dashboard.py reads them; a card without them has no bar, and its line is a task.
export function sessionCard({ s, pins, compact, limits, set, ...page }) {
  const glow = lit(page, s.id, [s]), st = status(s), count = s.progress?.join('/'), started = s.createdAt ?? s.startedAt;
  // The animations of a card in a hidden tab start when it is shown, so that counts as drawing it anew.
  const since = first(`${s.id} ${st.cls} ${page.shown}`);
  const toggle = () => { expanded.has(s.id) ? expanded.delete(s.id) : expanded.add(s.id); redraw(); };
  const title = compact
    ? html`<button class="title" onClick=${toggle} title="${s.title}: click for its tasks">${s.title}</button>`
    : html`<span class="title">${s.title}</span>`;
  // Point at a working session's state for the last steps of its turn.
  const steps = s.steps?.length ? ['Last steps this turn:', ...s.steps.map(x => '· ' + x)].join('\n') : undefined;
  const tasks = s.tasks.filter(t => t !== st.lead);
  const pinned = !!pins[s.id];
  // Left out when there is nothing in them, or an empty one would still take its gap in the column.
  const acts = s.vscode || s.closed;
  return html`
    <div class="session scard ${st.cls} ${expanded.has(s.id) ? 'open' : ''} ${glow === null ? '' : 'glow'}" style=${glow === null ? undefined : `animation-delay: -${glow}ms`}>
      <span class="ring" title=${st.word + (count ? `, ${count} steps` : '')}>${ring(s, st, since)}</span>
      <div>
        <div class="top">${title}<button class="pin" data-pin=${s.id} onClick=${() => set('pinned', p => { const n = { ...p }; pinned ? delete n[s.id] : n[s.id] = true; return n; })}
          aria-pressed=${pinned} title=${pinned ? 'Unpin' : 'Pin to the top of its project'}>${PIN}</button></div>
        <div class="sub">${st.line}</div>
      </div>
      <div class="right">
        ${!s.closed && html`<div class="side" title=${started ? `Started ${ago(started)}` : undefined}>
          <span class="state" data-lines=${steps && ''} title=${steps}>${st.word} ${dur(s.state === 'idle' ? s.lastAt ?? s.since : s.since)}</span>
          <span>${count ? count + ' · ' : ''}${ctxTag(s, limits)}</span></div>`}
        ${acts && html`<span class="acts">
          ${s.vscode && html`<button type="button" onClick=${e => openSession(e.currentTarget, s.id)} title="Focus this session's VS Code window and tab">Open</button>`}
          ${s.closed && html`<button type="button" onClick=${() => set('dismissed', d => ({ ...d, [s.id]: version(s) }))}>Dismiss</button>`}</span>`}
      </div>
      ${s.progress && html`<progress value=${s.progress[0]} max=${s.progress[1]} style=${`--shine: -${since % 2200}ms`} aria-label="Progress" title="${s.progress.join(' of ')}, by the session's own count"></progress>`}
      ${tasks.length > 0 ? html`<ul>${tasks.map(t => html`<li class=${'✅🚫'.includes(t.emoji) ? 'fin' : undefined}><span class="emoji" title=${STATUS[t.emoji]}>${t.emoji}</span><span>${md(t.text)}${pickup(s, t)}</span></li>`)}</ul>` : null}
      <div class="note" title="Sessions are in the order they started, the oldest first. A pinned one goes first, the newest pin last of the pinned.">${[s.reportedAt && `From the report ${ago(s.reportedAt)}`, started && `started ${ago(started)}`].filter(Boolean).join(' · ')}</div>
    </div>`;
}

// The sessions' order inside a project (the dropdown right of the counts, `order`, kept per browser). Each one is pinned first (in the order the pins were made, so the newest pin is last of them,
// and pinning moves no other card), then by its own key, then oldest first, so ties keep their place. "Oldest started" is by when each was created (its first message; a
// session with no transcript yet, by when it started), so a card keeps its place while its state changes and a new session joins at
// the bottom (Emil Kirilov asked for this order on 2026-11-19; until then they went by state, then by the last work). "Last answered"
// is the session's last assistant message (`lastAt`), newest first. "Priority" is what the card's state says: needs you, working, idle,
// done, then closed (so on the Closed tab it is the same as the oldest first). Emil Kirilov asked for the three on 2026-11-22.
const born = s => new Date(s.createdAt ?? s.startedAt ?? s.lastAt).getTime();
const RANK = { needs: 0, busy: 1, idle: 2, done: 3, closed: 4 };
const orders = pins => {
  // `pins` is {id: true} in the order the pins were made (an object keeps its keys' order). A pin's place is its index; an unpinned card's is
  // Infinity, so a pinned one comes first, and two unpinned ones give NaN, which is falsy and leaves the tie to the ordering's own key.
  const keys = Object.keys(pins), at = s => pins[s.id] ? keys.indexOf(s.id) : Infinity;
  const pinnedFirst = (a, b) => at(a) - at(b);
  return {
    started: (a, b) => pinnedFirst(a, b) || born(a) - born(b),
    answered: (a, b) => pinnedFirst(a, b) || new Date(b.lastAt ?? 0) - new Date(a.lastAt ?? 0) || born(a) - born(b),
    priority: (a, b) => pinnedFirst(a, b) || RANK[status(a).cls] - RANK[status(b).cls] || born(a) - born(b),
  };
};

// Open all, on a project with 2 or more closed sessions: Emil Kirilov asked for it on 2026-11-18. One at a time: each Open
// focuses a VS Code window first, and the server runs the changes (Open is one) one at a time. The button stays, disabled, while it runs,
// though each session it resumes leaves the list.
async function openAll(name, list) {
  const ids = list.filter(s => s.vscode).map(s => s.id), failed = [];
  for (const [i, id] of ids.entries()) {
    opening.set(name, `Opening ${i + 1} of ${ids.length}…`);
    redraw();
    const r = await fetch('/open?session=' + encodeURIComponent(id), { method: 'POST' }).catch(() => null);
    if (!r?.ok) failed.push((list.find(s => s.id === id)?.title ?? id) + ': ' + (r ? await r.json().catch(() => r.status) : "the dashboard didn't answer"));
  }
  opening.delete(name);
  if (failed.length) alert("Couldn't open " + plural(failed.length, 'session') + ':\n' + failed.join('\n'));
  actions.refresh();
}
const openAllButton = (name, list) => opening.has(name)
  ? html`<button type="button" class="open-all" disabled>${opening.get(name)}</button>`
  : list.filter(s => s.vscode).length < 2 ? '' : html`<button type="button" class="open-all" onClick=${() => openAll(name, list)} title="Resume each of these sessions in VS Code">Open all</button>`;

// The projects of the shown buckets with no running session, for the list at the right end of the Claude sessions tab
// (Emil Kirilov chose it on 2026-11-26): a bucket's own columns only (`facts`), so a folder that is no project never appears, and
// none while the search box has text, since an empty project has nothing to match. A pinned project stays: a pin is for columns.
const idleProjects = (sessions, picked, facts, query) => query.trim() ? [] : picked.flatMap(b => (facts?.[b]?.columns ?? [])
  .filter(p => !sessions.some(s => s.bucket === b && s.project === p)).map(p => ({ bucket: b, repo: p, name: whose(picked, b, p) })));
// With one bucket shown, one column headed "No sessions"; with several, one column per bucket, headed by its name, A to Z, and the
// single projects together in a last column, "Single projects" (design B, Emil Kirilov, 2026-11-26). Each row is the repo's own name.
const byRepo = (a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0);
function idleColumns(list, picked) {
  if (picked.length < 2) return [['No sessions', list.sort(byRepo)]];
  const groups = Object.groupBy(list, p => (p.repo === p.bucket ? '' : pretty(p.bucket)));
  return [...Object.keys(groups).filter(Boolean).sort(), ...('' in groups ? [''] : [])].map(g => [g || 'Single projects', groups[g].sort(byRepo)]);
}
const idleList = (list, picked) => list.length > 0 && html`<div class="idle-list" role="group" aria-label="Projects with no running session">${idleColumns(list, picked).map(([head, rows]) => html`<div class="idle-col" key=${head}><h2>${head}</h2>${rows.map(p => html`<div class="idle-row" key=${p.name}>
  <span class="pname">${p.repo}</span><button type="button" onClick=${e => newSession(e.currentTarget, p.bucket, p.repo)}
    title="New empty session in ${p.repo}" aria-label="New empty session in ${p.name}">+ New</button></div>`)}</div>`)}</div>`;

// The whole tab: `sessions` (/data's list, the running ones or the closed ones that aren't dismissed) narrowed to the search
// by title, project and task, one column per project, and on the Claude sessions tab the list of projects with none running.
export function tab({ kind, sessions, query, pins, order, ...rest }) {
  const { picked, pinned, facts } = rest;
  const compare = orders(pins)[order] ?? orders(pins).started;
  const shown = sessions.filter(s => hit(query, s.title, s.project, ...s.tasks.map(t => t.text))).sort(compare);
  const card = s => html`<${sessionCard} key=${s.id} s=${s} pins=${pins} ...${rest}/>`;
  const columns = { list: shown, project: 'project', card, picked, pinned, facts, lit: list => lit(rest, 'column ' + list[0].project, list) };
  if (kind === 'closed') return shown.length ? byProject({ ...columns, head: openAllButton }) : empty(query, 'None.');
  const idle = idleList(idleProjects(sessions, picked, facts, query), picked);
  return shown.length ? html`${byProject(columns)}${idle}` : query.trim() ? empty(query, '') : idle || null;
}

// The counts line of the Claude sessions tab, with the ordering dropdown right of it, and on its right a short line about
// closed sessions that stopped mid-work: their count, and Show (the page's own buttons show the tab). The rest is said
// where Show leads, at the top of the Closed sessions tab (`stoppedLine`); Show opens that tab as a click in the menu does.
export function head({ sessions, closed, order, set }) {
  const count = cls => sessions.filter(s => status(s).cls === cls).length;  // as the cards say it
  const stopped = closed.filter(s => s.withoutClose);
  return html`
    <div class="sumrow"><p class="summary" id="summary">${sessions.length
      ? `${count('busy')} working · ${count('needs')} need you · ${count('idle')} idle${count('done') ? ` · ${count('done')} done` : ''}`
      : 'No sessions running'}</p>
      <select id="order" value=${order} onChange=${e => set('order', () => e.currentTarget.value)} aria-label="How the sessions are ordered in a project"
        title="How the sessions are ordered inside a project. Pinned ones are always first.">
        <option value="started">Oldest started first</option>
        <option value="answered">Last answered first</option>
        <option value="priority">Priority: needs you first</option>
      </select>
      ${stopped.length > 0 && html`<p class="crash" id="crash">⚠️ ${plural(stopped.length, 'session')} stopped mid-work${' '}
        <button type="button" data-tab="closed" onClick=${() => actions.pickTab('closed')}>Show</button></p>`}</div>`;
}

// The line at the top of the Closed sessions tab about the sessions that stopped mid-work (a crash, a force quit or VS Code
// quitting fills the tab): how many, how long ago the last one was active, and a button that dismisses those listed only
// for stopping mid-work, since an open task or an unpicked hand-over stays until dismissed on its own.
export function stoppedLine({ closed, set }) {
  const stopped = closed.filter(s => s.withoutClose), quiet = stopped.filter(s => !hasOpenTasks(s));
  if (!stopped.length) return null;
  const dismissAll = () => set('dismissed', d => ({ ...d, ...Object.fromEntries(quiet.map(s => [s.id, version(s)])) }));
  return html`<p class="crash" id="crash-closed">⚠️ ${plural(stopped.length, 'session')} stopped mid-work,
    the last one active ${ago(Math.max(...stopped.map(s => new Date(s.lastAt))))}: a crash, or VS Code quitting?
    ${quiet.length > 0 && html` <button type="button" onClick=${dismissAll}>Dismiss the ${quiet.length} with no open task</button>`}</p>`;
}

// The tabs' props from the page's state (main.js): the sessions of the buckets shown, and the closed ones not dismissed.
const listed = page => page.view.closed.filter(s => page.dismissed[s.id] !== version(s));
const common = page => ({ query: page.query, picked: page.picked, pinned: page.pinnedProjects, facts: page.data.bucketFacts, pins: page.pinned, order: page.order,
  compact: page.compact, limits: page.data.contextLimits, glowAt: page.glowAt, shown: page.tab === 'running', set: page.set });
export const running = { tab, fromPage: page => ({ kind: 'running', sessions: page.view.sessions, ...common(page) }) };
export const closed = { tab, fromPage: page => ({ kind: 'closed', sessions: listed(page), ...common(page) }) };
export const summary = { tab: head, fromPage: page => ({ sessions: page.view.sessions, closed: listed(page), order: page.order, set: page.set }) };
export const closedHead = { tab: stoppedLine, fromPage: page => ({ closed: listed(page), set: page.set }) };
