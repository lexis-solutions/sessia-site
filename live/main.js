// The page: it reads /data, keeps what each browser remembers, and draws every part of the page, each a component in
// its folder of sessia/, into its element of index.html, which keeps only the markup. Each component
// module exports `tab`, the component, and `fromPage`, its props from the page's state (`page` in render()). What a
// component asks of the page (draw again, read /data again, show a tab) is `actions` in core.js, which this fills in.
import { render as draw } from './vendor/preact.js';
import { BUCKETS, actions, chord, html, load, mod, save, sheets, usageCard, whose } from './core.js';
import * as panel from './panel/panel.js';
import * as firstRun from './panel/root.js';
import * as header from './header/header.js';
import { glowAt, notifyOn, toggleNotify, watch } from './header/notify.js';
import * as scheduled from './scheduled/scheduled.js';
import * as code from './unsaved_code/code.js';
import * as notes from './notes/notes.js';
import * as sessions from './sessions/sessions.js';
import * as worktrees from './worktrees/worktrees.js';
import * as productivity from './productivity/productivity.js';
import * as usage from './usage/usage.js';
import './scrollbar.js';

const { TABS, PART_OF, listed, stale, narrow } = panel;
const $ = id => document.getElementById(id);

// By the id of the element each one draws into. One component draws the Claude sessions and the Closed sessions tab (and
// the line above each), and one the Bugs and the TODO tab, and one the line at the top of the page that an ?issue= link
// leaves when it names no item, and the first-run screen, which stands in for the tabs while there is no projects folder yet.
const PARTS_OF_PAGE = { side: panel, top: header, 'first-run': firstRun, offline: header.offline, 'git-settings': header.heldBack, 'issue-missing': notes.missing,
  'running-head': sessions.summary, 'closed-head': sessions.closedHead, running: sessions.running, closed: sessions.closed,
  scheduled, code, bugs: notes.bugs, todo: notes.todo, worktrees, productivity, usage };

// Per-browser memory (load() and save() in core.js): the open tab, the buckets, pinned sessions, pinned projects (the
// newest first), dismissed closed sessions ({id: time of the report dismissed}), the compact view, the theme and the
// ordering; the notifications switch is notify.js's and the months shown the Productivity tab's. Open folds last until a reload.
let pinned = load('pinned', {}), dismissed = load('dismissed', {});
const pinnedProjects = load('pinnedProjects', []);
let compact = load('compact', false), tab = load('tab', 'running');
// The buckets the tabs show, one or several (data.buckets: a client's or a single project's folder name, Sessia's own, or
// Other). Every list in data carries its bucket; render() cuts them down to these into `view`. The notifications and
// the browser tab's icon follow them too, so the other buckets are quiet (Emil Kirilov, 2026-11-18); what waits
// in them still shows in their entries. Several at once: Emil Kirilov asked on 2026-11-19. The old one-bucket choice
// ('bucket') is read once.
let picked = load('buckets', null) ?? [load('bucket', null)].filter(Boolean);
// How the sessions are ordered in a project ('started', 'answered' or 'priority', picked in the dropdown of sessia/sessions/sessions.js).
let order = load('order', 'started');
if (!['started', 'answered', 'priority'].includes(order)) order = 'started';
// The theme, as the <head> script of index.html put it on <html> before the first paint.
let theme = document.documentElement.dataset.theme;
// The words in the search box, which narrow the open tab's lists (every tab narrows its own: hit() and narrowIn() in core.js).
let query = '';

// /data comes in parts (data_part() in server.py), so a tab is drawn when its own part has come and not when the slowest
// has: a cold start reads every transcript and repo, a minute and more. PART_OF (panel.js) is the part each tab waits for.
const PARTS = ['base', 'sessions', 'code', 'worktrees', 'notes', 'scheduled'];
// What the parts not here yet would hold, so the drawing code needs no check for each. A tab whose part is missing shows its skeleton.
const NONE = { buckets: [], sessions: [], closed: [], code: [], notes: { bugs: [], todo: [] }, scheduled: [], worktrees: [], mrErrors: {}, usage: {} };
const loaded = new Set(), texts = {};  // the parts that came, and the text of each one's last answer (null: ask again)
export let data;
let offline = false, updated = '';
// The program's build and latest commit when this tab first heard from the server (data.build, data.head): a later one means
// a `git pull` changed the program under this tab, and the logo says so (panel.js, Logo).
let boot;
// Whether a part is there to draw: `sessions` also says `loading` while the server's first read of the transcripts runs, with no sessions yet.
const ready = part => loaded.has(part) && !(part === 'sessions' && data?.loading);
const SKELETON = '<div class="skeleton" aria-hidden="true">' + [3, 2].map(n => '<div class="sk-col"><i class="sk-bone sk-name"></i>'
  + '<div class="sk-card"><i class="sk-bone sk-ring"></i><i class="sk-bone sk-l1"></i><i class="sk-bone sk-l2"></i></div>'.repeat(n) + '</div>').join('') + '</div>';
for (const p of document.querySelectorAll('[role="tabpanel"]')) p.insertAdjacentHTML('beforeend', SKELETON);
for (const el of document.querySelectorAll('[data-buckets-word]')) el.textContent = BUCKETS;

// The browser tab's icon shows what needs you most: a session waiting for you, then work that
// could get lost or is overdue, then a session at work. 💤 means all quiet, 🔌 no server.
const setIcon = e => $('favicon').href = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${e}</text></svg>`);

// What the sessions' components change in what this page keeps for them (pinned sessions, dismissed ones, the order): `change` gets the
// value and returns the new one, which is saved per browser, and the page is drawn again.
function set(key, change) {
  const next = change({ pinned, dismissed, order }[key]);
  if (key === 'pinned') pinned = next; else if (key === 'dismissed') dismissed = next; else order = next;
  save(key, next);
  render();
}

// The bucket menu: a bucket alone, or (toggle) added to or taken from those shown, keeping at least one; no
// bucket means all of them. A toggle leaves the menu open, to pick several in a row (panel.js closes it otherwise).
function pickBucket(b, toggle) {
  if (b === undefined) picked = [...data.buckets];
  else if (!toggle) picked = [b];
  else if (!picked.includes(b)) picked = data.buckets.filter(x => x === b || picked.includes(x));
  else if (picked.length > 1) picked = picked.filter(x => x !== b);
  save('buckets', picked);
  render();
}

Object.assign(actions, {
  usage: key => data?.usage?.[key],
  redraw: () => render(),
  refresh: () => { for (const p of PARTS) texts[p] = null; refresh(); },
  // Another tab and bucket (an ?issue= link's item), not remembered, like a click on the tab would.
  show: (t, bucket) => { tab = t; if (!picked.includes(bucket)) picked = [bucket]; render(); },
  pickTab: t => { tab = t; save('tab', tab); render(); },
  pinProject: name => {
    const i = pinnedProjects.indexOf(name);
    i < 0 ? pinnedProjects.push(name) : pinnedProjects.splice(i, 1);
    save('pinnedProjects', pinnedProjects);
    render();
  },
});

// The whole page, from its state: every part of PARTS_OF_PAGE into its element, with `page` for their fromPage().
export function render() {
  if (data) {  // the first bucket on the first visit, or when every picked folder is gone (the list is whole once `sessions` has come: it adds Other)
    if (ready('sessions')) picked = [...new Set(picked)].filter(b => data.buckets.includes(b));
    if (!picked.length && data.buckets.length) picked = [data.buckets[0]];
  }
  document.body.classList.toggle('compact', compact);
  // The Productivity tab belongs to one bucket, the one whose folder has productivity.py (data.productivity.bucket).
  const prodHere = !data || picked.includes(data.productivity?.bucket);
  const shownTab = tab === 'productivity' && !prodHere ? 'running' : tab;
  lastKey = prodHere ? 8 : 7;  // Productivity, the 8th, is the only keyed tab that is ever hidden; the 9th, Usage, has no key
  for (const [t] of TABS) {
    $('panel-' + t).hidden = t !== shownTab || !!data?.firstRun;
    $('panel-' + t).classList.toggle('loading', !ready(PART_OF[t]));
    $('panel-' + t).ariaBusy = !ready(PART_OF[t]);
  }
  const mine = x => picked.includes(x.bucket);
  const view = data && { sessions: data.sessions.filter(mine), closed: data.closed.filter(mine), code: data.code.filter(mine),
    notes: { bugs: data.notes.bugs.filter(mine), todo: data.notes.todo.filter(mine) }, scheduled: data.scheduled.filter(mine),
    worktrees: (data.worktrees ?? []).filter(mine), gitSettings: (data.gitSettings ?? []).filter(mine),
    mrErrors: Object.fromEntries(picked.flatMap(b => Object.entries(data.mrErrors?.[b] ?? {}).map(([r, e]) => [whose(picked, b, r), e]))) };
  // The logo's dot (panel.js, Logo): this tab is older than the program on disk, and/or Sessia's own main folder is behind GitHub.
  const own = data?.code.filter(r => data.bucketFacts?.[r.bucket]?.own).flatMap(r => r.branches).find(b => b.isMain);
  const update = data && boot && { stale: data.build !== boot.build, since: boot.head, behind: own?.behind ?? 0 };
  const page = { data, view, update, picked, query, pinnedProjects, compact, tab, shownTab, prodHere, pinned, dismissed, order, glowAt, loaded, ready, set,
    redraw: actions.redraw, refresh: actions.refresh, pickBucket, pickTab: actions.pickTab, updated, offline, theme, notifyOn,
    heading: TABS.find(([t]) => t === shownTab)[1],
    setQuery: q => { query = q; render(); },
    toggleNotify: async () => { await toggleNotify(); render(); },
    toggleAwake: async () => { await fetch(`/awake?on=${data?.awake?.on ? 0 : 1}`, { method: 'POST' }).catch(() => {}); refresh(); },
    toggleCompact: () => { compact = !compact; save('compact', compact); render(); },
    // On <html>, where the styles read it, and the <head> script puts it back on the next visit.
    setTheme: t => { theme = t; save('theme', t); document.documentElement.dataset.theme = t; render(); },
  };
  if (data && notes.beforeDraw(page)) return;  // an ?issue= link's item asked for its tab and bucket, and the page was drawn again
  for (const [id, part] of Object.entries(PARTS_OF_PAGE))
    if (data || ['side', 'top', 'offline'].includes(id)) draw(html`<${part.tab} ...${part.fromPage(page)}/>`, $(id));
  // The icon covers the shown buckets only, like the notifications.
  if (data && ready('sessions')) {
    const here = st => view.sessions.some(s => s.state === st);
    setIcon(here('waiting') ? '⏳' : view.closed.some(listed(dismissed)) || view.scheduled.some(stale) ? '⚠️' : here('busy') ? '🔄' : '💤');
  }
  // A redraw may replace the element under the pointer, or change its title: point the tooltip at what is there now.
  if (tipped && !tipped.isConnected) { hideTip(); showTip(tipFor(document.elementFromPoint(...pointer))); }
  else if (tipped?.title) { const el = tipped; hideTip(); showTip(el); }
  else if (tipped?.dataset.usage) draw(usageOf(tipped), tip.firstChild);  // the open card follows the numbers, and keeps a field's cursor
}

let refreshing = false;
// Asks for one part of /data and draws it when it has come. Nothing here waits after the answer, so each part is drawn whole, in the order the answers come.
async function ask(part) {
  const text = await (await fetch('/data?part=' + part)).text();
  offline = false;
  updated = new Date().toLocaleTimeString();
  const fresh = text !== texts[part];
  const got = fresh && JSON.parse(text), next = fresh ? { ...NONE, ...data, ...got } : data;
  if (part === 'base' && got.build && !boot) boot = { build: got.build, head: got.head };
  if (got.waiting) return;  // its git hasn't been read since the server started: the skeleton stays, the next round asks again
  // `base` lists the folders without Other, which only `sessions` knows: when it changes later, Other stays in the list.
  if (fresh && part === 'base' && loaded.has('sessions')) next.buckets = [...got.buckets, ...data.buckets.filter(b => b === 'Other')];
  watch(next, picked);
  if (!fresh) return;
  texts[part] = text;
  loaded.add(part);
  data = next;
  render();
}
async function refresh() {
  if (refreshing) return;  // one round at a time: a slow part keeps the round open, and a round that starts while another runs would only repeat it
  refreshing = true;
  try {
    // `base` first (the buckets and the header: almost free), then all the other parts at once, the open tab's first, so a slow
    // one (a git read the server does inside its request) holds back no other tab. The round ends when the last has answered.
    await ask('base');
    const rest = PARTS.filter(p => p !== 'base').sort((a, b) => (b === PART_OF[tab]) - (a === PART_OF[tab]));
    const failed = (await Promise.allSettled(rest.map(ask))).find(r => r.status === 'rejected');
    if (failed) throw failed.reason;
    render();  // once a round with no news too: "Updated" and the times ("5m ago") move on
  } catch {
    offline = true;
    render();
    setIcon('🔌');
  } finally {
    refreshing = false;
  }
}

// A session's gold glow starts when the page is first looked at.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Object.values(glowAt).includes(null)) render();
});
narrow.addEventListener('change', () => render());  // the menu's aria-orientation, and where a tab's tooltip goes

// Tooltips: every title attribute, shown the moment the pointer or the focus arrives instead of
// after the browser's one-second delay. While one shows, its title sits in data-tip so the browser's
// own tooltip doesn't appear too, and the element points at the tooltip with aria-describedby.
// The tokens used on a column's name (data-usage, usageCard() in core.js) open a card the pointer can go into, to set a
// limit: it stays while the pointer is on it or a field in it has the cursor, and Esc closes it while the cursor is in it or on the numbers.
const tip = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tip', role: 'tooltip', popover: 'manual' }));
let tipped, pointer = [0, 0], lastKey = 8;
const tipFor = target => target?.closest?.('[title], [data-tip], [data-day], [data-shortcuts], [data-usage]');
const usageOf = el => { const u = data?.usage?.[el.dataset.usage]; return u ? html`<${usageCard} id=${el.dataset.usage} name=${el.dataset.usageName} u=${u}/>` : null; };
// The shortcuts the keydown handlers below act on, as the icon in the header lists them. Keep this list and those handlers in step.
const keysCard = () => html`<h3>Keyboard shortcuts</h3><dl>
  <dt><kbd>${mod}</kbd> <kbd>1</kbd> … <kbd>${lastKey}</kbd></dt><dd>Open a tab of the menu, in its order</dd>
  <dt><kbd>/</kbd><span class="or">or</span><kbd>${mod}</kbd> <kbd>K</kbd></dt><dd>Search the open tab</dd>
  <dt><kbd>Esc</kbd></dt><dd>Empty the search box</dd></dl>`;
export function showTip(el) {
  if (el === tipped) return;
  hideTip();
  if (!el) return;
  tipped = el;
  if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); }
  el.setAttribute('aria-describedby', 'tip');
  // A day in the heat map, and the shortcuts icon in the header: a component draws its card into a fresh element.
  if (el.dataset.day) draw(html`<${productivity.dayCard} day=${el.dataset.day}/>`, tip.appendChild(document.createElement('div')));
  else if ('shortcuts' in el.dataset) draw(keysCard(), tip.appendChild(document.createElement('div')));
  else if (el.dataset.usage) draw(usageOf(el), tip.appendChild(document.createElement('div')));
  else tip.textContent = el.dataset.tip;
  tip.classList.toggle('rich', !!el.dataset.day);
  tip.classList.toggle('usage', !!el.dataset.usage);
  tip.classList.toggle('shortcuts', 'shortcuts' in el.dataset);
  tip.classList.toggle('lines', 'lines' in el.dataset);
  tip.showPopover();  // the top layer, so it also shows above a popover (the bucket menu's + button), which no z-index can pass
  tip.style.left = 0;  // measure at full width, not squeezed against the right edge by the last position
  tip.style.removeProperty('--room');  // and at full height, not cut to the last one's room
  const w = tip.offsetWidth, h = tip.offsetHeight, item = el.closest('nav [role="tab"]');
  if (item && !narrow.matches && !item.classList.contains('danger')) {  // a tab in the side menu: its tip (⌘1…) to the right of it, like a menu's shortcut; a red tab's reason goes below it
    const r = item.getBoundingClientRect();
    tip.style.left = r.right + 8 + 'px';
    tip.style.top = r.top + r.height / 2 - h / 2 + 'px';
    return;
  }
  const r = el.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
  // Below the element, or above when it doesn't fit below; when it fits on neither side, on the side with more room. --room is how
  // high it may be there: the tokens' card (usage.css) scrolls inside it, so it never covers its element. Any other tooltip that tall
  // runs past the window's bottom edge when below, and when above is pushed back down on screen, over its element.
  const below = innerHeight - r.bottom - 6, above = r.top - 14, down = h <= below || (h > above && below >= above);
  tip.style.top = (down ? r.bottom + 6 : Math.max(8, r.top - 6 - h)) + 'px';
  tip.style.setProperty('--room', (down ? (h <= below ? below : below - 8) : above) + 'px');  // a card that fits below isn't cut; one that scrolls stops 8 px from the edge
}
function hideTip() {
  if (!tipped) return;
  // A title a redraw put back meanwhile is the newer one: keep it.
  if (tipped.dataset.tip) { if (!tipped.hasAttribute('title')) tipped.title = tipped.dataset.tip; delete tipped.dataset.tip; }
  tipped.removeAttribute('aria-describedby');
  tipped = undefined; tip.textContent = ''; tip.hidePopover();
}
// The tokens' card opens only after the pointer has stayed on the numbers for 0.4 s (Emil Kirilov, 2026-11-27), so passing over them doesn't flash it; every other tooltip, and the keyboard focus, still show at once.
let usageWait, usageWaitFor;
const USAGE_DELAY = 400;
const cancelUsageWait = () => { clearTimeout(usageWait); usageWaitFor = undefined; };
document.addEventListener('mouseover', e => {
  pointer = [e.clientX, e.clientY];
  if (tip.contains(e.target) || tip.contains(document.activeElement)) return;
  const el = tipFor(e.target);
  if (el?.dataset.usage && el !== tipped) {
    if (el === usageWaitFor) return;  // still on the same numbers: keep counting
    cancelUsageWait(); hideTip(); usageWaitFor = el;
    usageWait = setTimeout(() => { usageWaitFor = undefined; if (el.isConnected && el.matches(':hover')) showTip(el); }, USAGE_DELAY);
    return;
  }
  cancelUsageWait();
  showTip(el);
});
document.addEventListener('mouseout', e => { if (!e.relatedTarget) { cancelUsageWait(); if (!tip.contains(document.activeElement)) hideTip(); } });
document.addEventListener('focusin', e => { if (!tip.contains(e.target)) showTip(tipFor(e.target)); });
// Safari doesn't focus a button it clicks, so a click on the card's style buttons moves the focus nowhere: the pointer on the card keeps it.
document.addEventListener('focusout', e => { if (!tip.contains(e.relatedTarget) && e.relatedTarget !== tipped && !tip.matches(':hover')) hideTip(); });

// "/" (not while typing in a field) and ⌘K (Ctrl+K elsewhere) put the cursor in the search box; Escape there,
// or with nothing focused, empties it and takes the cursor out.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && tipped?.dataset.usage && (tip.contains(e.target) || e.target === tipped)) { e.target.blur(); hideTip(); return; }  // the tokens' card
  const box = $('search'), typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey
      || e.key.toLowerCase() === 'k' && chord(e)) {
    e.preventDefault();
    box.focus();
    box.select();
  } else if (e.key === 'Escape' && (e.target === box || document.activeElement === document.body)) {
    query = '';
    box.blur();
    render();
  }
});
// ⌘1 to ⌘8 (Ctrl+1 to Ctrl+8 elsewhere) open the menu's first eight tabs in order, as a click would. ⌘9 stays the browser's "last tab", so the ninth, Usage, has no key.
document.addEventListener('keydown', e => {
  const t = e.key < 9 && document.querySelector(`nav [data-tab="${TABS[e.key - 1]?.[0]}"]`);
  if (!t || t.hidden || !chord(e)) return;
  e.preventDefault();
  t.click();
});

await Promise.all(sheets);  // the components' stylesheets (css() in core.js), so the first draw isn't unstyled
render();
refresh();
setInterval(refresh, 2000);
