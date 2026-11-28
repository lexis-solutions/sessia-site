// The Bugs and TODO tabs: every repo's BUGS.md and TODO.md items (notes() in __init__.py), one column per repo, high
// priority first. One component draws both: `kind` is 'bugs' or 'todo', as /data's `notes` has them. Samples of each
// state are in samples.js, shown at /gallery.
import { actions, byProject, css, empty, hit, html, md, narrowIn, start } from '../core.js';

css(import.meta.url, 'notes.css');

const PRIORITIES = ['🔴', '🟠', '🟡'];
const FILES = { bugs: 'BUGS.md', todo: 'TODO.md' };
const FLASH_MS = 3000;  // as in the .flash animation in notes.css

// A title as plain text, for a tooltip.
const plain = s => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\[(.+?)\]\(.+?\)/g, '$1');

// Another circle in a priority menu: saved in the file on GitHub, then the page reads /data again (actions.refresh),
// which draws the list as the file now has it, also after a save that failed.
async function setPriority(select, item) {
  select.disabled = true;
  const r = await fetch('/priority?' + new URLSearchParams({ ...item, priority: select.value }), { method: 'POST' }).catch(() => null);
  if (!r?.ok) alert("The priority wasn't saved: " + (r ? await r.json().catch(() => r.status) : "the dashboard didn't answer"));
  select.disabled = false;
  actions.refresh();
}

// Open on an item's running session: its VS Code window and tab, as the session's own card does.
async function openSession(id) {
  const r = await fetch('/open?session=' + encodeURIComponent(id), { method: 'POST' }).catch(() => null);
  if (!r?.ok) alert("Couldn't open the session: " + (r ? await r.json().catch(() => r.status) : "the dashboard didn't answer"));
}

// The item an ?issue= link names, once it is shown: scrolled to, once, so a redraw doesn't pull the page back.
const scrollTo = el => { if (el && asked?.scroll) { asked.scroll = false; el.scrollIntoView({ block: 'center' }); } };

// One item: its priority as a menu, the name of its issue's assignee if it has an issue (a link to the issue), its
// title with its text in a fold, under it each running session that started from it (a TODO item's `runs`) with Open,
// and ▶️, which opens a new Claude session in the repo with the item in its input box (after a question, when the
// issue is someone else's or a session runs it already). `focus` is the item an ?issue= link names: first in its
// list, open, with a bar at its left edge while `lit`, and flashing for FLASH_MS from `flashFrom`.
function note({ repo, kind, x, focus, compact, login }) {
  const issue = x.issue, who = issue && (issue.name ?? issue.login), whose = issue && `${who ?? 'No assignee'} · issue #${issue.number}`;
  const item = { kind, bucket: repo.bucket, repo: repo.repo, group: x.group ?? '', title: x.title };
  const lit = focus?.lit && x === focus.x, flash = lit && Date.now() - focus.flashFrom < FLASH_MS;
  const title = html`${md(x.title)}${x.group && html` <span class="tag">${x.group}</span>`}`;
  return html`
    <li class="entry ${lit ? 'focus' : ''} ${flash ? 'flash' : ''}" ref=${lit ? scrollTo : null}>
      <select class="prio" value=${x.priority} onChange=${e => setPriority(e.currentTarget, item)} title="Priority: pick another circle to change it">
        ${PRIORITIES.map(p => html`<option>${p}</option>`)}</select>
      ${issue && html`<a class="owner" href=${issue.url} target="_blank" rel="noopener"
        title="GitHub issue #${issue.number}${issue.login ? `, assigned to ${issue.login}` : ''}: click to open it">${whose}</a>`}
      ${x.body ? html`<details open=${x === focus?.x}>
        <summary title=${compact && issue ? whose : undefined}>${title}</summary><div class="note body">${md(x.body.replace(/^```.*\n?/gm, ''))}</div></details>`
        : html`<span title=${compact ? plain(x.title) + (issue ? ` — ${whose}` : '') : undefined}>${title}</span>`}
      ${x.runs?.length > 0 && html`<p class="runs">${x.runs.map(r => html`<span key=${r.id}>Session running: ${r.title}
        <button type="button" onClick=${() => openSession(r.id)} title="Focus this session's VS Code window and tab">Open</button></span>`)}</p>`}
      <button class="start" onClick=${e => start(e.currentTarget, item, issue, login, x.runs)}
        title="Open a new Claude session in ${repo.repo}'s VS Code window, with this item in its input box">▶️</button>
    </li>`;
}

// One repo's card: its items, the one an ?issue= link names first.
export function notesCard({ repo, kind, focus, ...rest }) {
  const items = [...repo.items].sort((a, b) => (b === focus?.x) - (a === focus?.x));
  return html`<div class="session"><ul>${items.map(x => html`<${note} key=${`${x.group} ${x.title}`} repo=${repo} kind=${kind} x=${x} focus=${focus} ...${rest}/>`)}</ul></div>`;
}

// The whole tab: the repos narrowed to the search by repo, group, title and text.
export function tab({ kind, repos, query, focus, compact, login, ...columns }) {
  const shown = narrowIn(query, repos, 'items', (r, x) => hit(query, r.repo, x.group, x.title, x.body));
  const card = r => html`<${notesCard} key=${`${r.bucket} ${r.repo}`} repo=${r} kind=${kind} focus=${focus} compact=${compact} login=${login}/>`;
  return shown.length ? byProject({ list: shown, project: 'repo', card, ...columns }) : empty(query, `No items in any ${FILES[kind]}.`);
}

// A link http://localhost:7357/?issue=<folder>/<number> opens the item whose Issue line names that GitHub issue:
// its tab and bucket, the item first in its list with its text open, a bar at its left edge, scrolled to, and its
// background flashing once to catch the eye. The bar stays until another tab or item is clicked (clearIssue()); then
// the query leaves the address, so a reload doesn't light the item again, and the item keeps its place and its open
// text until the page is reloaded, so a click never moves the page under the pointer. With no such item (it may be
// fixed and deleted), a line at the top of the page says so (missing). `asked` is that link's state, if there is one.
const link = new URLSearchParams(location.search).get('issue');
const asked = link && { link, ...link.match(/^(?<repo>.+)\/(?<number>\d+)$/)?.groups, lit: true };

// The link's item in /data: its tab (kind), repo and item, or undefined. The first bucket that has such a repo wins.
function findIssue(data) {
  if (asked) for (const kind of ['bugs', 'todo'])
    for (const repo of data.notes[kind].filter(r => r.repo === asked.repo)) {
      const x = repo.items.find(x => Number(x.issue?.number) === Number(asked.number));
      if (x) return { kind, repo, x };
    }
}

// Before each draw of the page (main.js): the first time the item can be shown, ask the page for its tab and bucket
// (actions.show, which draws again, and so comes back here), and say so, so the draw that asked stops; in a background
// tab the flash waits to be seen.
export function beforeDraw(page) {
  const found = asked && findIssue(page.data);
  if (!found || !asked.lit) return false;
  asked.kind = found.kind;
  if (!asked.shown) {
    asked.shown = asked.scroll = true;
    actions.show(found.kind, found.repo.bucket);
    return true;
  }
  if (!document.hidden) asked.flashFrom ??= Date.now();
  return false;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && asked?.lit && !asked.flashFrom) actions.redraw(); });

// Another tab or another item was clicked: the marker goes, and the link's query with it. In the capture phase,
// so it comes before the click's own work, as it did when dashboard.html's own script did it.
function clearIssue() {
  asked.lit = false;
  history.replaceState(null, '', location.pathname);
  actions.redraw();
}
document.addEventListener('click', e => {
  if (!asked?.lit) return;
  const t = e.target.closest('[data-tab]'), entry = e.target.closest('li.entry');
  if (t ? t.dataset.tab !== asked.kind : entry && !entry.classList.contains('focus')) clearIssue();
}, true);

// `focus` for the tabs: the link's item with whether it is still lit, and when its flash began, or undefined.
const focusOf = page => { const f = asked && findIssue(page.data); return f && { x: f.x, lit: asked.lit, flashFrom: asked.flashFrom }; };

const fromKind = kind => page => ({ kind, repos: page.view.notes[kind], query: page.query, picked: page.picked, pinned: page.pinnedProjects,
  facts: page.data.bucketFacts, focus: focusOf(page), compact: page.compact, login: page.data.login });
export const bugs = { tab, fromPage: fromKind('bugs') };
export const todo = { tab, fromPage: fromKind('todo') };

// The line at the top of the page when no item names the issue, with a link to the issue on GitHub when the folder is a repo.
export function IssueMissing({ link, number, github }) {
  return link && html`<p class="crash">⚠️ No item in a BUGS.md or TODO.md names the issue ${link}: it may be fixed and deleted already, or
    this Mac hasn't fetched it yet. ${github && number && html`<a href="${github}/issues/${number}" target="_blank" rel="noopener">Open issue #${number} on GitHub</a>`}</p>`;
}
export const missing = {
  tab: IssueMissing,
  fromPage: page => {
    if (!asked?.lit || !page.loaded.has('notes') || findIssue(page.data)) return {};  // not before the notes have come: nothing is missing yet
    const github = Object.values(page.data.github ?? {}).map(m => m[asked.repo]).find(Boolean);
    return { link: asked.link, number: asked.number, github };
  },
};
