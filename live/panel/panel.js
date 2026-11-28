// The left panel: the logo and Sessia's name, the bucket menu next to it, the menu of tabs with each tab's count and
// alert, and when /data last answered. In a window narrower than 760 px it is a row on top. Samples of each state are
// in samples.js, shown at /gallery.
import { useRef, useState } from '../vendor/hooks.js';
import { BUCKETS, aria, chord, combo, css, html, mod, plural, pretty } from '../core.js';
import { version } from '../sessions/sessions.js';
import { BEHIND, UNCOMMITTED } from '../unsaved_code/code.js';
import { Confirm, RootLine, useChooser } from './root.js';
import { AddItem, AddTo, MoveConfirm } from './move.js';

css(import.meta.url, 'panel.css');

// The tabs, in the menu's order, which ⌘1 to ⌘8 follow: by the id of each tab's panel, and its name.
export const TABS = [['running', 'Claude sessions'], ['closed', 'Closed sessions'], ['code', 'Code not safe yet'], ['bugs', 'Bugs'],
  ['todo', 'TODO'], ['scheduled', 'Scheduled'], ['worktrees', 'Worktrees'], ['productivity', 'Productivity'], ['usage', 'Usage']];
// ⌘1 to ⌘8 open the first eight tabs; ⌘9 is the browser's, so the ninth, Usage, has no key.
const keyed = i => i < 8;
// The part of /data each tab waits for (data_part() in server.py): its count is blank until that part has come.
export const PART_OF = { running: 'sessions', closed: 'sessions', usage: 'sessions', productivity: 'base', code: 'code', bugs: 'notes', todo: 'notes', scheduled: 'scheduled', worktrees: 'worktrees' };
// Each bucket's colour in the Usage tab, by its place in data.buckets; Other is grey. (The bucket menu had it as a dot until 2026-11-26.)
const BUCKET_COLORS = ['#2f6fde', '#1a8f4c', '#9b51e0', '#d9480f', '#0c8599', '#c2255c', '#5c940d', '#e67700'];

// A bucket's colour, by its place in the list of buckets (the Usage tab uses them too).
export const bucketColor = (buckets, b) => b === 'Other' || !buckets.includes(b) ? 'var(--idle)' : BUCKET_COLORS[buckets.indexOf(b) % BUCKET_COLORS.length];

// In a narrow window the menu is a row (the styles' 760px rule), so a screen reader is told it runs from left to right
// there; main.js draws again when it changes.
export const narrow = matchMedia('(max-width: 760px)');

// Days from today to an item's YYYY-MM-DD date, in this Mac's time zone; an item whose date has passed is overdue.
const daysTo = d => Math.round((Date.parse(d) - Date.parse(new Date().toLocaleDateString('sv'))) / 86400000);
export const stale = x => x.date && daysTo(x.date) < 0;
// A merged or closed branch with a folder left and no session running in it: about to clean up after itself.
export const isLeftover = w => (w.group === 'merged' || w.group === 'closed') && !w.sessions.some(s => s.running);
// A closed session that isn't dismissed (as Dismiss in sessia/sessions/sessions.js keeps it).
export const listed = dismissed => s => dismissed[s.id] !== version(s);

// What waits in a bucket, for its entry in the menu: [the bucket, its sessions that need you, how many of its tabs' red
// alerts it has (a closed session listed, a scheduled item overdue, a merged branch's folder left, a main folder behind or
// with changes, a repo held back by its git settings)].
function waits(data, dismissed, b) {
  const of = list => list.filter(x => x.bucket === b);
  return [b, of(data.sessions).filter(s => s.state === 'waiting').length,
    of(data.closed).filter(listed(dismissed)).length + of(data.scheduled).filter(stale).length + of(data.worktrees ?? []).filter(isLeftover).length
      + of(data.code).filter(r => r.branches.some(x => x.isMain && (x.behind || x.uncommitted))).length + of(data.gitSettings ?? []).length];
}

const CHEVRON = html`<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;

const LOGO = html`<svg viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="var(--text)"/>
  <path d="M9 10.5l6 5.5-6 5.5" fill="none" stroke="var(--card)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="17" y="19.5" width="7.5" height="3" rx="1.5" fill="#2fbf71"/>
</svg>`;

// The commits in the update popover: each one's short title (the full one in its tooltip) and its id.
const Commits = ({ list }) => list?.length > 0 && html`<ul>${list.map(c => html`<li key=${c.sha} title=${c.full}><span class="what">${c.title}</span><code>${c.sha}</code></li>`)}</ul>`;

// The logo. While a newer Sessia exists it grows a pulsing dot, and a click opens a popover (like the bucket menu's) with
// what is new. `update` is {stale, since, behind, root}: `stale` when this tab was loaded before the program on disk last
// changed (data.build, sessia/server.py: Reload gets the new page), `behind` how many commits GitHub has that this Mac's
// copy of Sessia lacks (the Code tab's own number: only a `git pull` gets them, which Pull now runs and the popover also
// gives to copy). The commits' titles are asked for when the popover opens (/whats-new), so the 2-second polls carry no
// git. Emil Kirilov picked this look on 2026-11-24 from four, and asked for the long commit titles to be made short.
// Pull now (POST /pull, pull() in server.py) says "Pulling…" and then what the server answered: the pulled changes, or why
// it refused. The gallery's samples pass `pulling` and `said` to show those states.
function Logo({ update }) {
  const [news, setNews] = useState(update?.news ?? null), menu = useRef(), button = useRef(), [copied, setCopied] = useState(false);
  const [pulling, setPulling] = useState(!!update?.pulling), [said, setSaid] = useState(update?.said ?? '');
  if (!update?.stale && !update?.behind) return LOGO;
  const place = e => {
    if (e.newState !== 'open') return;
    const r = button.current.getBoundingClientRect();
    Object.assign(menu.current.style, { top: `${r.bottom + 6}px`, left: `${r.left}px` });
    if (!pulling) setSaid('');  // an old answer would be stale by now
    if (!update.news) fetch('/whats-new?since=' + encodeURIComponent(update.since ?? '')).then(r => r.json()).then(setNews, () => setNews({ loaded: [], github: [] }));
  };
  const copy = () => navigator.clipboard.writeText(news.pull).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  const pull = () => {
    setPulling(true);
    fetch('/pull', { method: 'POST' }).then(r => r.json()).catch(() => "Sessia didn't answer. Try again, or paste the command in Terminal.")
      .then(text => { setSaid(text); setPulling(false); });
  };
  return html`<button id="update-btn" ref=${button} popovertarget="update-menu" aria-haspopup="dialog"
      aria-label=${`${update.stale ? 'A new version of Sessia is here' : 'Sessia has new changes on GitHub'}: show what changed`}
      title=${update.stale ? 'A new version of Sessia is here' : 'Sessia has new changes on GitHub'}>${LOGO}<span class="pulse" aria-hidden="true"></span></button>
    <div id="update-menu" ref=${menu} popover role="dialog" aria-label="What is new in Sessia" onBeforeToggle=${place}>
      ${update.stale && html`<section>
        <h4>New version of Sessia</h4>
        <p>This tab still shows the old one.</p>
        <${Commits} list=${news?.loaded}/>
        <div class="row"><button class="primary" onClick=${() => location.reload()}>Reload</button></div>
      </section>`}
      ${update.behind > 0 && html`<section>
        <h4>${plural(update.behind, 'new change')} on GitHub</h4>
        <p>Not on this Mac yet. To get ${update.behind === 1 ? 'it' : 'them'}, pull now, or paste this in Terminal on your Mac:</p>
        <code class="cmd">${news?.pull ?? 'git pull'}</code>
        <${Commits} list=${news?.github}/>
        <p class="said" role="status">${pulling ? 'Pulling…' : said}</p>
        <div class="row"><button onClick=${copy} disabled=${!news}>${copied ? 'Copied' : 'Copy the command'}</button><button class="primary"
          id="pull-btn" onClick=${pull} disabled=${pulling}>Pull now</button></div>
      </section>`}
    </div>`;
}

// The bucket menu, at the name: the button names the shown bucket ("+1" for each more, "All buckets" when every one is
// shown), and its menu, a popover so it sits above the panel (Esc or a click outside closes it), lists every bucket with
// what waits there. A click shows that one alone and closes the menu; ⌘-click (Ctrl-click elsewhere), Space, or ⌘ or
// Ctrl and Enter adds it or takes it away and leaves the menu open (pickBucket() in main.js). Up and down move through it.
// Emil Kirilov picked this look on 2026-11-20 from five, and on 2026-11-25 its list (design D): a small title, "All buckets"
// first with a ✓ when every bucket is shown, and Add a bucket… last (move.js); since the same day each
// client's line ends in a faint + that moves a folder into it (AddTo, move.js), which → on the line reaches and ← leaves.
// The entries keep their elements across a redraw (their key), so the keyboard's place in an open menu survives one. Its
// last line is the projects folder, with Change… (root.js).
// A client's folder icon, where a bucket's coloured dot was until 2026-11-26: it marks a bucket that holds projects (the same
// buckets that end in a +). A single project has an empty slot there, so every name lines up. Emil Kirilov picked this on 2026-11-26.
const FOLDER = html`<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3.1l1.4 1.5h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
function bucketMenu({ entries, clients, movable, picked, pickBucket, button, setOpen, root, choose, add }) {
  const menu = useRef(), [drag, setDrag] = useState(null), [over, setOver] = useState(null);
  const pick = (b, toggle) => { pickBucket(b, toggle); if (!toggle) menu.current.hidePopover(); };
  const all = entries.length > 0 && entries.every(([b]) => picked.includes(b));
  const keys = e => {
    const on = document.activeElement, plus = on.classList.contains('add-to');
    const items = [...menu.current.querySelectorAll('button:not(.add-to)')], i = items.indexOf(plus ? on.previousElementSibling : on);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'ArrowRight' && on.nextElementSibling?.classList.contains('add-to') || e.key === 'ArrowLeft' && plus) {
      e.preventDefault();
      (plus ? on.previousElementSibling : on.nextElementSibling).focus();
    } else if ((e.key === ' ' || e.key === 'Enter' && chord(e)) && document.activeElement.dataset.only !== undefined) {
      e.preventDefault();
      pickBucket(document.activeElement.dataset.only, true);
    }
  };
  // A project dragged onto a client (draggable buttons, a client's line takes the drop) asks the same confirmation as the +, with the
  // project's bucket named, so the server finds its folder (move_folder(bucket=…)). Nothing moves before that confirmation's Move.
  const dropOn = (e, b) => { if (drag && clients.includes(b)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(b); } };
  const drop = (e, b) => {
    if (!drag || !clients.includes(b)) return;
    e.preventDefault();
    const from = drag;
    setDrag(null); setOver(null);
    menu.current.hidePopover();
    add(undefined, { bucket: from, into: b });
  };
  const place = e => {
    setOpen(e.newState === 'open');
    const r = button.current.getBoundingClientRect();
    if (e.newState === 'open') Object.assign(menu.current.style, { top: `${r.bottom + 4}px`, left: `${r.left}px` });
  };
  return html`<div id="bucket-menu" ref=${menu} popover role="menu" aria-label=${`The ${BUCKETS} the tabs show: the clients and projects whose sessions and repos you see`}
      onBeforeToggle=${place} onToggle=${e => e.newState === 'open' && menu.current.querySelector('[aria-checked="true"]')?.focus()} onKeyDown=${keys}>
      <div class="title" role="presentation">${BUCKETS}</div>
      <div id="bucket-list">${entries.length > 0 && html`<button role="menuitemcheckbox" aria-checked=${all} data-all onClick=${() => pick()}><span class="tick">${all ? '✓' : ''}</span><span
        class="slot"></span><span class="grow">All ${BUCKETS}</span></button>`}${entries.map(([b, n, a]) => html`<div class=${over === b ? 'line drop' : 'line'} key=${b} role="none" onDragOver=${e => dropOn(e, b)}
        onDragLeave=${e => !e.currentTarget.contains(e.relatedTarget) && setOver(o => o === b ? null : o)} onDrop=${e => drop(e, b)}><button
        role="menuitemcheckbox" aria-checked=${picked.includes(b)} data-only=${b} draggable=${movable.includes(b) || undefined}
        onDragStart=${e => { e.dataTransfer.setData('text/plain', b); e.dataTransfer.effectAllowed = 'move'; setDrag(b); }} onDragEnd=${() => { setDrag(null); setOver(null); }}
        onClick=${e => pick(b, e.metaKey || e.ctrlKey)}><span class="tick">${picked.includes(b) ? '✓' : ''}</span>${clients.includes(b) ? FOLDER : html`<span class="slot"></span>`}<span class="grow">${pretty(b)}</span>${n > 0 && html`<span class="wait">⏳ ${n}</span>`}${a > 0 && html`<span>⚠️</span>`}</button>${clients.includes(b)
        && html`<${AddTo} bucket=${b} add=${add} menu=${menu}/>`}</div>`)}${entries.length > 0
        && html`<${AddItem} add=${add} menu=${menu}/>`}</div>
      <hr/><p class="hint">Click: show only this one<br/><span id="bucket-key">${mod}</span>-click or Space: add it or take it away${movable.length > 0 && clients.length > 0 && html`<br/>Drag a project onto a client: move it in`}</p>
      ${root && html`<hr/><${RootLine} root=${root} choose=${choose} menu=${menu}/>`}
    </div>`;
}

// The menu of tabs. A tab that needs attention is red, with no icon, and says why in a tooltip on its button, which also
// gives its key (⌘1…); a count not known yet (its part of /data hasn't come) is blank, not 0. Productivity shows only
// while its bucket is shown (`prodHere`).
function menu({ data, view, dismissed, open, prodHere, ready, pickTab }) {
  const count = {}, why = {};
  if (data) {
    const closed = view.closed.filter(listed(dismissed));
    const mains = view.code.flatMap(r => r.branches.filter(b => b.isMain));
    const leftovers = view.worktrees.filter(isLeftover), overdue = view.scheduled.filter(stale).length;
    Object.assign(count, { running: view.sessions.length, closed: closed.length, code: view.code.reduce((n, r) => n + r.branches.length, 0),
      bugs: view.notes.bugs.reduce((n, r) => n + r.items.length, 0), todo: view.notes.todo.reduce((n, r) => n + r.items.length, 0),
      scheduled: view.scheduled.length, worktrees: view.worktrees.length,
      productivity: data.productivity?.report ? Math.round(data.productivity.report.months[0].hours) + 'h' : '' });
    Object.assign(why, {
      closed: closed.length > 0 && 'Some sessions closed with open tasks, with handed-over work no session has picked up yet, or in the middle of their work. Check that no work got lost, then reopen or dismiss them.',
      code: [mains.some(b => b.behind) && BEHIND, mains.some(b => b.uncommitted) && UNCOMMITTED].filter(Boolean).join(' '),  // a main folder behind GitHub or with uncommitted changes
      // Red only for a merged or closed branch with a folder left and no session running in it (it is about to clean up after
      // itself). Ongoing branches and the odd ones never turn the tab red.
      worktrees: leftovers.length > 0 && `${plural(leftovers.length, 'branch', 'branches')} merged or closed still ${leftovers.length > 1 ? 'have a folder' : 'has a folder'} here. Delete them: each one that passes the checks has a Delete button.`,
      scheduled: overdue > 0 && 'An item is overdue: its date has passed. Do it, then delete it from its SCHEDULED.md, or move a repeating item to its next date.',
    });
    for (const t in PART_OF) if (!ready(PART_OF[t])) count[t] = '';  // not 0: it isn't known yet
  }
  return html`<nav role="tablist" aria-orientation=${narrow.matches ? 'horizontal' : 'vertical'}>${TABS.map(([t, name], i) => html`<button key=${t} role="tab" data-tab=${t}
    aria-selected=${t === open} hidden=${t === 'productivity' && !prodHere} class=${why[t] ? 'danger' : undefined} title=${why[t] ? `${why[t]} (${combo(i + 1)})` : keyed(i) ? combo(i + 1) : undefined}
    aria-keyshortcuts=${keyed(i) ? aria(i + 1) : undefined} onClick=${() => pickTab(t)}>${name}<span class="count" id=${'count-' + t}>${count[t] ?? ''}</span></button>`)}</nav>`;
}

// The whole panel. `entries` waits for /data: before it comes, the bucket button and the counts are blank. On the first-run
// screen (data.firstRun, root.js) there is no bucket to pick and no tab, so only the logo and the name show. `shown` is the
// projects folder's confirmation (root.js), after the bucket menu's Change…, and `moved` the move's (a +, or Add a bucket…, move.js); the
// gallery draws both on their own.
export function tab({ data, dismissed, picked, pickBucket, updated, update, ...rest }) {
  const entries = data ? data.buckets.map(b => waits(data, dismissed, b)) : [], button = useRef(), [open, setOpen] = useState(false);
  const [shown, choose, close] = useChooser(), [moved, add, closeMove] = useChooser(undefined, '/move-check'), first = !!data?.firstRun;
  const all = entries.length > 1 && picked.length === entries.length;
  // The buckets that can be dragged into a client: single projects and notes projects (not a client, Sessia's own folder or Other).
  const clients = data?.clients ?? [], facts = data?.bucketFacts ?? {}, movable = entries.map(([b]) => b).filter(b => facts[b] && !facts[b].own && !clients.includes(b));
  return html`
    <div class="brand">
      <${Logo} update=${update}/>
      Sessia
      <span class="sl" aria-hidden="true" hidden=${first}>/</span>
      <button id="bucket-btn" ref=${button} popovertarget="bucket-menu" aria-haspopup="menu" aria-expanded=${open} hidden=${first}>${entries.length > 0 && html`<span
        class="name">${all ? `All ${BUCKETS}` : pretty(picked[0])}</span>${!all && picked.length > 1 && html`<span class="more">+${picked.length - 1}</span>`}${CHEVRON}`}</button>
    </div>
    <${bucketMenu} entries=${entries} clients=${clients} movable=${movable} picked=${picked} pickBucket=${pickBucket} button=${button} setOpen=${setOpen} root=${data?.rootShown} choose=${choose} add=${add}/>
    ${!first && html`<${menu} data=${data} dismissed=${dismissed} ...${rest}/>`}
    ${shown && html`<${Confirm} key=${shown.folder ?? (shown.waiting ? 'waiting' : 'refused')} shown=${shown} close=${close}/>`}
    ${moved && html`<${MoveConfirm} key=${moved.folder ?? (moved.waiting ? 'waiting' : 'refused')} shown=${moved} close=${closeMove}/>`}
    <div class="foot"><span class="updated" id="updated">${updated && `Updated ${updated}`}</span></div>`;
}

// The page's state that the panel shows, and what its menus change (main.js).
export const fromPage = page => ({ data: page.data, view: page.view, dismissed: page.dismissed, picked: page.picked, pickBucket: page.pickBucket,
  updated: page.updated, update: page.update, open: page.shownTab, prodHere: page.prodHere, ready: page.ready, pickTab: page.pickTab });
