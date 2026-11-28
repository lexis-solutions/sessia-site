// The header, a bar across the top of the page's main part: the open tab's name, the search box, the settings (the
// three switches, the theme and the keyboard shortcuts icon) and whose name git signs with in the shown bucket
// (identities() in __init__.py). Under it, the line that says the server isn't running (`offline`), and a red row per
// repo held back by its own git settings (`heldBack`). Samples of each state are in samples.js, shown at /gallery.
import { BUCKETS, aria, combo, css, html, pretty, whose } from '../core.js';
import { canNotify } from './notify.js';

css(import.meta.url, 'header.css');

// The marks of the two sites, in the header's circle when the bucket's origin is on one but no account picture was found.
const FORGES = {
  github: html`<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`,
  gitlab: html`<svg viewBox="0 0 24 24"><path d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.405.875.875 0 0 0-1 .054.875.875 0 0 0-.29.44L16.47 7.818H7.537L5.332 1.07a.857.857 0 0 0-.29-.441.875.875 0 0 0-1-.054.859.859 0 0 0-.336.405L.433 9.502l-.032.086a6.066 6.066 0 0 0 2.012 7.01l.011.009.03.021 4.976 3.727 2.462 1.863 1.5 1.132a1.009 1.009 0 0 0 1.22 0l1.499-1.132 2.462-1.863 5.006-3.749.013-.01a6.068 6.068 0 0 0 2.01-7.003z"/></svg>`,
};

// The theme: three radio buttons that look like one control, so the arrow keys move between them.
const THEMES = [
  ['light', 'Light theme', html`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.4"/><path d="M10 1.8v1.9M10 16.3v1.9M1.8 10h1.9M16.3 10h1.9M4.2 4.2l1.35 1.35M14.45 14.45l1.35 1.35M4.2 15.8l1.35-1.35M14.45 5.55l1.35-1.35"/></svg>`],
  ['dark', 'Dark theme', html`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.6 12.2A7 7 0 0 1 7.8 3.4a7 7 0 1 0 8.8 8.8z"/></svg>`],
  ['auto', 'Auto: light or dark, as this device is set', html`<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10" rx="1.6"/><path d="M7 17h6M10 13.5V17"/></svg>`],
];

const NOTIFY_TIP = canNotify ? 'A notification, with a sound, when a session in the buckets you picked needs you or is done, and when one of its scheduled items comes due. The browser asks for its permission on the first click.'
  : 'This browser has no notifications';

// A switch: a knob on the right and a blue track mean on (Emil Kirilov asked on 2026-11-18 for a control that shows it).
const toggle = (id, on, label, onClick, more = {}) => html`<button id=${id} class="switch" role="switch" aria-checked=${on} onClick=${onClick} ...${more}><span class="track" aria-hidden="true"></span>${label}</button>`;

// Whose name and e-mail git signs with in the first shown bucket (`bucket`; `several` when more are shown, so the tooltip
// names it), with the account's picture, else its site's icon, else the initials.
function who({ who, bucket, several, login }) {
  if (!who) return html`<div class="who" id="who"></div>`;
  const face = who.avatar ? html`<img class="face" src=${who.avatar} alt=""/>`
    : FORGES[who.forge] ? html`<span class="face" aria-hidden="true">${FORGES[who.forge]}</span>`
    : html`<span class="face" aria-hidden="true">${(who.name || who.email).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>`;
  const title = `Commits in ${several ? pretty(bucket) + `'s` : `this ${BUCKETS.slice(0, -1)}'s`} repos are made under this name and e-mail: git's user.name and user.email there.`
    + (login ? ` This computer's GitHub account is ${login}.` : '');
  return html`<div class="who" id="who" title=${title}>${face} <span><b>${who.name}</b><small>${who.email}</small></span></div>`;
}

// The bar. The shortcuts icon has no title: its tooltip is the list of shortcuts (data-shortcuts, keysCard() in main.js),
// shown on hover and on focus. Its search box is a controlled input: the page keeps the words (`query`) and narrows the open tab with them.
export function tab({ heading, query, setQuery, notifyOn, toggleNotify, awake, toggleAwake, compact, toggleCompact, theme, setTheme, ...rest }) {
  return html`
    <h1 id="heading">${heading}</h1>
    <input id="search" type="search" placeholder=${`Search   /  ${combo('K')}`} aria-label="Search the open tab" autocomplete="off"
      aria-keyshortcuts=${`/ ${aria('K')}`} value=${query} onInput=${e => setQuery(e.currentTarget.value)}/>
    <div class="settings">
      ${toggle('notify', notifyOn, 'Notifications', toggleNotify, { disabled: !canNotify, title: NOTIFY_TIP })}
      ${toggle('awake', !!awake?.on, 'Keep Mac awake', toggleAwake, { title: 'Keeps this Mac from going to sleep on its own while a session is working, and lets it sleep as usual when none is. '
        + 'The screen still turns off as usual, so a dark screen doesn\'t mean the Mac is asleep, and closing the lid still sleeps it. '
        + (awake?.holding ? 'Holding it awake now.' : 'Not holding it now.') })}
      ${toggle('compact', compact, 'Compact view', toggleCompact)}
      <fieldset class="theme" aria-label="Theme">
        ${THEMES.map(([value, label, icon]) => html`<label key=${value} title=${label}><input type="radio" name="theme" value=${value} aria-label=${label}
          checked=${theme === value} onChange=${() => setTheme(value)}/>${icon}</label>`)}
      </fieldset>
      <button type="button" class="help" data-shortcuts aria-label="Keyboard shortcuts"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="1.8" y="4.5" width="16.4" height="11" rx="2"/><path d="M5 8h.01M8 8h.01M11 8h.01M14 8h.01M5.5 12h9"/></svg></button>
      <${who} ...${rest}/>
    </div>`;
}

// The page's state that the header shows, and what its controls change (main.js).
export const fromPage = page => ({ heading: page.heading, query: page.query, setQuery: page.setQuery, notifyOn: page.notifyOn, toggleNotify: page.toggleNotify,
  awake: page.data?.awake, toggleAwake: page.toggleAwake, compact: page.compact, toggleCompact: page.toggleCompact, theme: page.theme, setTheme: page.setTheme,
  who: page.data?.identity?.[page.picked[0]], bucket: page.picked[0], several: page.picked.length > 1, login: page.data?.login });

// The line that says the server isn't answering, while /data fails.
export const Offline = ({ offline }) => offline && html`<div class="offline">
  The dashboard server isn't running. It starts at login once <code>./setup.sh</code> has run; to start it by
  hand, run <code>python3 dashboard.py</code> on your Mac, in <code>~/Projects/sessia</code>.
  Errors are in <code>~/Library/Logs/sessia-dashboard.log</code>.
</div>`;
export const offline = { tab: Offline, fromPage: page => ({ offline: page.offline }) };

// One red row per repo whose own git settings name a program (held() in repos.py), with the command that accepts each
// setting; shown on every tab, since the dashboard runs no git there. `settings` is /data's gitSettings of the shown buckets.
export function HeldBack({ settings, picked }) {
  const held = Object.entries(Object.groupBy(settings, x => whose(picked, x.bucket, x.repo)));
  return held.length > 0 && html`<div class="crash">${held.map(([repo, list]) => html`<p key=${repo}>⚠️ <b>${repo}</b>: its own git settings name a program that git runs:
    ${list.map((x, i) => html`${i ? ', ' : ''}<code>${x.setting} = ${x.value}</code>${x.file.endsWith('config') ? '' : ` (${x.file})`}`)}.
    So the dashboard runs no git in it: its branches, worktrees, TODO, bugs and scheduled items aren’t shown. If ${list.length > 1 ? 'they are' : 'it is'} yours,
    accept ${list.length > 1 ? 'each' : 'it'} in a terminal on this computer, and git comes back within half a minute:
    ${list.map((x, i) => html`${i ? ' ' : ''}<code class="accept">${x.accept}</code>`)}</p>`)}</div>`;
}
export const heldBack = { tab: HeldBack, fromPage: page => ({ settings: page.view.gitSettings, picked: page.picked }) };
