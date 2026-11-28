// The projects folder, whose folders are the buckets (sessia.root, which setup.sh root-dir=<folder> sets): the bucket
// menu's last line with Change… (panel.js), the first-run screen when there is no bucket yet, and the confirmation both
// end in. Emil Kirilov picked these on 2026-11-24 from four mockups: Change… opens macOS's own "Choose a folder" window
// (the server opens it, since a browser never tells a page a folder's path), and the first run offers the folders in the
// home folder that hold git repos. Switch runs setup.sh on the server, which then restarts; the page waits for the new
// folder and reloads. The server's side is root_check(), root_switch() and the rest of their part of sessia/server.py.
import { useEffect, useRef, useState } from '../vendor/hooks.js';
import { BUCKETS, html, plural } from '../core.js';

// A POST to the server, with `query`'s values in the address: { ok, body }, the answer read as JSON.
export const post = async (path, query = {}) => {
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  const r = await fetch(path + (q ? '?' + q : ''), { method: 'POST' });
  return { ok: r.ok, body: await r.json() };
};
export const NO_ANSWER = "Sessia didn't answer. Is it running?";

// What `path` says about `folder`: /root-check what switching to it means (root_check() in server.py), /move-check what
// moving it in means (move.js), with `more` saying where (`into` a client, or a new bucket's `group`). With no folder, first
// the folder picked in macOS's window: null when Cancel was pressed there. A refusal comes back as `refuse`, the server's reason.
export async function check(folder, path = '/root-check', more = {}) {
  try {
    if (!folder && !more.bucket) {  // a dragged bucket is named, so there is nothing to choose
      const r = await post('/choose-folder', { for: path === '/move-check' && 'move' });
      if (!r.ok) return { refuse: r.body };
      if (!r.body) return null;
      folder = r.body;
    }
    const r = await post(path, { folder, ...more });  // `more.bucket`: a bucket already in the projects folder, dragged onto a client (move.js)
    return r.ok ? r.body : { refuse: r.body === 'no such folder' ? `There is no folder ${folder}.` : r.body };
  } catch {
    return { refuse: NO_ANSWER };
  }
}

// Asks for a folder (check() above) and keeps what comes back, for <Confirm> or <MoveConfirm>: { waiting: true } while macOS's window is open.
export function useChooser(given, path) {
  const [shown, setShown] = useState(given ?? null);
  const choose = async (folder, more) => {
    if (!folder) setShown({ waiting: true, ...more });
    setShown(await check(folder, path, more));
  };
  return [shown, choose, () => setShown(null)];
}

// After Switch: asks the server every second which folder it shows, and reloads once it shows the new one (it restarts to
// read it); after 90 seconds it gives up and says where setup.sh's words went.
async function waitFor(folder, say) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const root = await fetch('/data?part=base').then(r => r.json()).then(d => d.root, () => null);
    if (root === folder) return location.reload();
  }
  say('Sessia did not come back with the new folder. What setup.sh said is in ~/Library/Logs/sessia-dashboard.log.');
}

// The confirmation: how many folders become buckets, the warning about the folder shown now, and Switch, or, when the
// folder can't be used, the reason (setup.sh's own when it would refuse) and no Switch. A modal <dialog>, opened when it is
// drawn; `inline` (the gallery) draws it open in place instead. `said` is what the server answered, or how far the switch is.
export function Confirm({ shown, close, inline, said: given }) {
  const box = useRef(), [said, setSaid] = useState(given ?? ''), [busy, setBusy] = useState(!!given);
  useEffect(() => { if (!inline && !box.current.open) box.current.showModal(); }, []);
  const go = async () => {
    setBusy(true);
    setSaid('Switching: setup.sh is running…');
    const r = await post('/root-switch', { folder: shown.folder }).catch(() => ({ ok: false, body: NO_ANSWER }));
    if (!r.ok) { setBusy(false); return setSaid(r.body); }
    setSaid(`Sessia is restarting to show ${shown.shown}. This page reloads by itself.`);
    waitFor(shown.folder, text => { setBusy(false); setSaid(text); });
  };
  const n = shown.buckets, what = n === 1 ? `1 folder becomes a ${BUCKETS.replace(/s$/, '')}` : `${n} folders become ${BUCKETS}`;
  let body;
  if (shown.waiting) body = html`<h3>Choose the folder</h3><p>Pick the folder that holds your projects in the window macOS just opened. It may be behind the browser.</p>`;
  else if (shown.refuse) body = html`<h3>${shown.folder ? html`Can't use <code>${shown.shown}</code>` : "Can't switch the projects folder"}</h3>
    <p class="refuse">${shown.refuse}</p><div class="row"><button class="primary" onClick=${close}>Pick another</button></div>`;
  else body = html`<h3>Show <code>${shown.shown}</code>?</h3>
    <p>Sessia would read your projects from this folder instead of <code>${shown.old}</code>. ${n ? `${what} (${plural(shown.repos, 'repo')}). ` : `No folder in it holds a git repo or a CLAUDE.md yet, so Sessia would show no ${BUCKETS}. `}Sessia's rules and checks cover the sessions there.</p>
    <p class="warn">${shown.oldIsSessia ? html`The repos in <code>${shown.old}</code> lose Sessia's git checks.`
      : html`Sessions open in <code>${shown.old}</code> lose Sessia's rules: setup.sh takes its links out of that folder.`}</p>
    <p class="said" role="status">${said}</p>
    <div class="row"><button onClick=${close} disabled=${busy}>Cancel</button><button class="primary" id="root-switch" onClick=${go} disabled=${busy}>Switch</button></div>`;
  return html`<dialog ref=${box} class="root-confirm" open=${inline || undefined} aria-label="Switch the projects folder" onClose=${() => !busy && close()}>${body}</dialog>`;
}

// The bucket menu's last line (panel.js): the projects folder, and Change…, which opens macOS's window. `choose` is useChooser()'s.
export const RootLine = ({ root, choose, menu }) => html`<div class="root-hint">Projects folder: each folder in it is one ${BUCKETS.replace(/s$/, '')} above.</div><div class="root-line"><span class="path" title=${root}>📁 <code>${root}</code></span><button
  id="root-change" role="menuitem" title="Pick a different folder to hold your projects. Its folders become the ${BUCKETS} above. You confirm before anything changes." onClick=${() => { menu.current.hidePopover(); choose(); }}>Change…</button></div>`;

// The first-run screen, in place of the tabs while there is no projects folder yet (data.firstRun: no sessia.root, and
// the folder shown has no bucket): "Which folder holds your projects?", with a card for each folder in the home folder that
// holds git repos (root_suggestions(), asked for once), and Other…, macOS's window. `found` and `shown` are the gallery's.
export function tab({ firstRun, found: given, shown: picked }) {
  const [found, setFound] = useState(given ?? null), [shown, choose, close] = useChooser(picked);
  useEffect(() => {
    if (firstRun && !found) post('/root-suggestions').then(r => setFound(r.ok ? r.body : []), () => setFound([]));
  }, [firstRun]);
  if (!firstRun) return null;
  return html`<section class="first-run" aria-labelledby="first-run-h">
    <h2 id="first-run-h">Which folder holds your projects?</h2>
    <p>Its folders become ${BUCKETS}: the clients and projects whose Claude sessions and repos Sessia shows, and Sessia's rules cover the sessions in them.
      ${found === null ? ' Looking in your home folder…' : found.length ? ' Found in your home folder:' : ' None was found in your home folder, so pick one with Other….'}</p>
    <div class="cards">${(found ?? []).map(f => html`<button key=${f.folder} onClick=${() => choose(f.folder)}><code>${f.shown}</code><small>${plural(f.repos, 'repo')}</small></button>`)}
      <button id="root-other" onClick=${() => choose()}><span>Other…</span><small>Choose it in a Finder window</small></button></div>
    <p class="later">You can change it later, at the end of the ${BUCKETS} menu next to Sessia's name.</p>
    ${shown && html`<${Confirm} key=${shown.folder ?? (shown.waiting ? 'waiting' : 'refused')} shown=${shown} close=${close} inline=${!!picked}/>`}
  </section>`;
}

export const fromPage = page => ({ firstRun: !!page.data?.firstRun });
