// Moving a folder from elsewhere on this Mac into the projects folder, with no Claude session, from the bucket menu
// (panel.js): the + on a client's line moves it into that client, and Add a bucket…, the menu's last line, makes it a
// bucket of its own. A click opens macOS's "Choose a folder" window (the server opens it, as for Change…, root.js), then
// one confirmation: what the folder becomes and where it goes, what a dry run of move-folder.py says, and Move, which runs
// it for real and shows what it printed. The server's side is move_folder() and move_places() in sessia/server.py; it makes
// the place itself from the client or the new bucket's name, so the page never names a path. Emil Kirilov picked the menu's
// look on 2026-11-25 (design D of four), kept the one confirmation, since nothing undoes a move, and the same day decided
// the split, from the canvas https://claude.ai/artifact/88R3zCYw7m8ABSPMKmqsKk. On 2026-11-27 he added the form that starts a git
// repo for a folder that has none (sessia/repostart.py), and had the dry run drawn as a numbered list.
import { useEffect, useId, useRef, useState } from '../vendor/hooks.js';
import { html, pretty } from '../core.js';
import { NO_ANSWER, check, post } from './root.js';

const PLUS = html`<svg class="plus" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v8M1 5h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

// The bucket menu's last item, in blue, with a + where a client has its folder icon. `add` is useChooser(…, '/move-check')'s.
export const AddItem = ({ add, menu }) => html`<button id="add-bucket" role="menuitem" onClick=${() => { menu.current.hidePopover(); add(); }}
  title="Move a folder from elsewhere on this Mac into the projects folder as a new bucket, after one confirmation that shows what it becomes and what changes"><span
  class="tick"></span>${PLUS}<span class="grow">Add a bucket…</span></button>`;

// The + at the right end of a client's line: a button of its own next to the line's, since a button can't hold one. The
// arrow keys skip it (tabindex -1); → on the line reaches it and ← goes back (bucketMenu() in panel.js).
export const AddTo = ({ bucket, add, menu }) => html`<button class="add-to" role="menuitem" tabindex="-1" data-into=${bucket}
  aria-label=${`Move a folder into ${pretty(bucket)}`} title=${`Move a folder from elsewhere on this Mac into ${pretty(bucket)}, after one confirmation that shows what changes`}
  onClick=${() => { menu.current.hidePopover(); add(undefined, { into: bucket }); }}>${PLUS}</button>`;

const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]*$/, HOSTS = { github: 'GitHub', gitlab: 'GitLab' };

// move-folder.py's dry run: the lines that begin "would: " are the steps, in order, drawn as a numbered list in plain words; what
// follows them (the files that still name the old path, the processes) stays as the script printed it.
const split = said => {
  const lines = (said ?? '').split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('would: ')) i++;
  return [lines.slice(0, i).map(l => l[7].toUpperCase() + l.slice(8)), lines.slice(i).join('\n').trim()];
};

// What the repo form asks the server for (the same as what Move sends): nothing until every field is usable. `accts` is /repo-accounts' answer.
const repoMoreOf = (on, accts, r) => {
  const a = accts?.find(x => x.host === r.host), owner = a?.owners.includes(r.owner) ? r.owner : a?.owners[0];
  return on && a?.ok && owner && NAME_OK.test(r.name) ? { repo: r.host, owner, repoName: r.name, vis: r.vis } : {};
};

// The steps the repo adds to the numbered list, from the plan the server made of the first commit (repoPlan in move_folder()).
const repoSteps = (more, plan) => [`Start a git repo in the folder, on the branch main${plan.gitignore ? ', with a .gitignore' : ''}`,
  `Commit ${plan.total} files as "First commit"`, `Create the ${more.vis} repo ${more.owner}/${more.repoName} on ${HOSTS[more.repo]}, and push main to it`];

// The secrets check, always on (Emil Kirilov, 2026-11-27): files that look like secrets are left out of the first commit, for a private repo too.
const Secrets = ({ plan, vis }) => plan.left.length ? html`<p class="note"><b>These files look like secrets, so they stay out of the first commit</b> (this check runs for a private repo too):</p>
    <ul class="left">${plan.left.map(l => html`<li><code>${l.file}</code>: ${l.why}</li>`)}</ul>
    ${vis === 'public' && html`<p class="note">Public means anyone on the internet can read every file of the repo, and its history.</p>`}`
  : html`<p class="why">Secrets check: no file looks like a secret (a file over 1 MB is checked by its name only).</p>${vis === 'public' && html`<p class="note">Public means anyone on the internet can read every file of the repo, and its history.</p>`}`;

// "2 of Atlas's repos are atlas-co's, as this one is", for a lone repo moved in as a bucket, whose origin's owner has repos in clients.
const alike = ({ alike: a, mine }) => new Intl.ListFormat('en').format(a.map(({ bucket, same }, i) => `${same} of ${pretty(bucket)}'s${i ? '' : ' repos'}`))
  + ` ${a.length > 1 || a[0].same > 1 ? 'are' : 'is'} ${mine}'s, as this one is. `
  + (a.length > 1 ? 'To put it into one of them, cancel and use the + next to it.' : `To put it there, cancel and use the + next to ${pretty(a[0].bucket)}.`);

// What the folder becomes as a bucket, by the rules Sessia lists folders with (scan_buckets() in core.py).
const becomes = s => s.kind === 'client' ? html`<p class="kind">It has ${s.repos} git repos, so it becomes a client, <b>${pretty(s.name)}</b>: a bucket that shows each of those repos as a column.</p>`
  : s.kind === 'notes' ? html`<p class="kind">It has a <code>CLAUDE.md</code> and no git, so it becomes a notes project, <b>${pretty(s.name)}</b>: its sessions show as one column.</p>`
  : s.kind === 'none' ? html`<p class="note">Sessia won't show it as a bucket: it has no git repo in it and no <code>CLAUDE.md</code>. Add a <code>CLAUDE.md</code> to it after the move, and it becomes a notes project.</p>`
  : '';

// The form that starts a git repo for a folder with no git in it (sessia/repostart.py): a checkbox, and when it is ticked the host,
// the account (the user's own first, then their organisations), the repo's name (the folder's, to start with) and who can see it.
// Nothing is made before Move; a host that isn't logged in says how to log in on this Mac and never asks for a token.
function RepoForm({ folder, plan, on, tick, accts, loadAccts, rp, change, setRp, more, busy }) {
  const id = useId(), a = accts?.find(x => x.host === rp.host), owner = a?.owners.includes(rp.owner) ? rp.owner : a?.owners[0] ?? '';
  return html`<fieldset class="repo" disabled=${busy}><legend><label><input type="checkbox" id="repo-on" checked=${on} onChange=${e => tick(e.target.checked)}/>
    Start a git repo for it, so it gets a column</label></legend>
    ${on && (accts === null ? html`<p class="why">Asking GitHub and GitLab which accounts you are logged in as…</p>` : html`<div class="fields">
      <label for=${id + 'h'}>Where</label>
      <select id=${id + 'h'} value=${rp.host} onChange=${e => change({ host: e.target.value, owner: '' })}>${Object.entries(HOSTS).map(([h, n]) => {
        const x = accts.find(y => y.host === h); return html`<option value=${h}>${n} (${x?.ok ? `logged in as ${x.login}` : 'not logged in'})</option>`; })}</select>
      <label for=${id + 'o'}>Account</label>
      <select id=${id + 'o'} value=${owner} disabled=${!a?.ok} onChange=${e => change({ owner: e.target.value })}>${a?.ok ? a.owners.map(o => html`<option value=${o}>${o}${o === a.login ? ' (you)' : ''}</option>`) : html`<option>log in first</option>`}</select>
      <label for=${id + 'n'}>Repo name</label>
      <input type="text" id=${id + 'n'} value=${rp.name} placeholder=${folder} spellcheck="false" onInput=${e => setRp({ ...rp, name: e.target.value.trim() })}
        onChange=${e => change({ name: e.target.value.trim() })} onKeyDown=${e => e.key === 'Enter' && change({ name: e.target.value.trim() })}/>
      <label for=${id + 'v'}>Who can see it</label>
      <select id=${id + 'v'} value=${rp.vis} onChange=${e => change({ vis: e.target.value })}><option value="private">Private: only people you add</option><option value="public">Public: anyone on the internet</option></select>
    </div>
    ${a && !a.ok && html`<p class="note">${a.say}</p><div class="row"><button onClick=${loadAccts}>Check again</button></div>`}
    ${rp.name && !NAME_OK.test(rp.name) && html`<p class="note">A repo's name is letters, digits, dots, dashes and underscores, and starts with a letter or a digit.</p>`}
    ${a?.ok && html`<p class="why">Branch <code>main</code>${more.repo ? html`, at <code>${rp.host}.com/${more.owner}/${more.repoName}</code>` : ''}.</p>
      <${Secrets} plan=${plan} vis=${rp.vis}/>
      ${plan.total > 0 && html`<details><summary>The ${plan.total} files of the first commit</summary><pre class="out">${plan.files.join('\n')}${plan.more ? `\n… and ${plan.more} more` : ''}</pre></details>`}`}`)}
  </fieldset>`;
}

// The screen before Move, from the parts the server cut the dry run into (`shown.plan`, sessia/moveresult.py, plan()): From → To, what
// changes in groups, and what will still name the old path, with the noise folded away (Emil Kirilov, 2026-11-27, design B of three).
// An older server sends no `plan`, and the dry run is drawn as before: the numbered list, then the rest as printed.
const FromTo = ({ from, to }) => html`<div class="fromto"><div><h4>From</h4><code>${from}</code></div><span class="arrow" aria-hidden="true">→</span>
  <div class="to"><h4>To</h4><code>${to}</code></div></div>`;
function Changes({ plan, extra }) {
  const groups = [];
  for (const s of [...plan.steps, ...extra]) (groups.find(g => g.label === s.group) ?? groups[groups.push({ label: s.group, items: [] }) - 1]).items.push(s);
  return html`<h4 class="what">What changes</h4><div class="changes">${groups.map(g => html`<div class="grp"><b>${g.label}</b>
    <span>${g.items.map(s => html`<span class="one" title=${s.more.length ? s.more.join('\n') : undefined}>${s.text}</span>`)}</span></div>`)}</div>`;
}
function Still({ left }) {
  const only = left.length === 1 && left[0].files;
  return left.length > 0 && html`<div class="left-box"><h4>${only ? 'Still names the old path afterwards' : 'Afterwards, these are yours'}</h4>${left.map(l => l.files
    ? html`<p>${l.files.length > 0 ? html`Change ${l.files.map((f, i) => html`${i ? (i === l.files.length - 1 ? ' and ' : ', ') : ''}<code>${f}</code>`)} yourself, or leave ${l.files.length > 1 ? 'them' : 'it'}.` : 'Only files of folders such as .venv name it.'}
      ${l.folded > 0 && html` <span class="muted">${count(l.folded, 'file')} of folders such as <code>.venv</code> too: nobody edits those.</span>`}${l.extra > 0 && html` <span class="muted">And ${count(l.extra, 'more entry', 'more entries')} that the list doesn't show.</span>`}<${Lines} more=${l.more}/></p>`
    : html`<p>${l.text}<${Lines} more=${l.more}/></p>`)}</div>`;
}
const count = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// What a move that went well says, from the parts the server cut move-folder.py's text into (`done.result`, sessia/moveresult.py): the
// outcome in one line, the steps ticked, notes, what is left for the user, and the full text folded away (Emil Kirilov, 2026-11-27,
// design A of three: "i think it worked but the report was hard to make sense of"). The hover on a step shows the details it folds.
const Lines = ({ more }) => more.length > 0 && html`<details><summary>Show the list</summary><pre class="out">${more.join('\n')}</pre></details>`;
// The item the move wrote for the files that still name the old path (`todo`, from move_todo() in server.py) and a ▶️ that starts a Claude
// session on it in the new folder's VS Code window, with its text in the input box, as ▶️ on the TODO tab does. The server holds the text.
const TODO_SAID = { added: 'A TODO.md item for it is in the new folder, not committed yet', already: 'TODO.md in the new folder has an item for it already', failed: "Sessia couldn't write TODO.md in the new folder, but the session still gets the same text" };
function StartTodo({ todo }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const go = async () => {
    setBusy(true); setError('');
    const r = await post('/move-start').catch(() => ({ ok: false, body: NO_ANSWER }));
    if (!r.ok) setError(r.body);
    setBusy(false);
  };
  return html`<div class="todo-start"><span class="why">${TODO_SAID[todo.state]}: “${todo.title}”.</span>
    <button onClick=${go} disabled=${busy} title="Open a new Claude session in the new folder's VS Code window, with this item's text in the input box (not sent)">${busy ? '⏳' : '▶️'} Start</button>
    ${error && html`<span class="why bad">${error}</span>`}</div>`;
}
function Result({ shown, done, close }) {
  const r = done.result, asked = r.repoAsked, failed = r.repo?.some(x => x.ok === false);
  const headline = ['Moved', asked ? (failed ? `, but starting the ${HOSTS[asked.host]} repo failed` : `, and a ${asked.vis} ${HOSTS[asked.host]} repo started`) : '', '.',
    r.listed ? ` Sessia now lists it as ${shown.into ? `a column of ${pretty(shown.into)}` : 'a bucket'}.` : r.listed === false ? " Sessia doesn't list it as a project." : ''].join('');
  return html`<h3>Moved <code>${shown.name}</code> ${shown.into ? `into ${pretty(shown.into)}` : 'in'}</h3>
    <div class=${'ok-line' + (failed || r.listed === false ? ' bad' : '')}><span class="big">${failed ? '✗' : r.listed === false ? '!' : '✓'}</span><span>${headline}</span></div>
    <ul class="checks">${[...r.steps.map(x => ({ ...x, ok: true })), ...(r.repo ?? []).filter(x => x.ok !== null)].map(x => html`<li class=${x.ok ? '' : 'failed'} title=${x.ok ? x.more.join('\n') : undefined}>
      <span>${x.text}${!x.ok && x.more.length > 0 && html`<pre class="out">${x.more.join('\n')}</pre>`}</span></li>`)}</ul>
    ${r.notes.map(n => html`<p class="why">${n}</p>`)}
    ${r.left.length > 0 && html`<div class="left-box"><h4>What's left for you</h4><ul>${r.left.map(l => html`<li>${l.text}<${Lines} more=${l.more}/>${l.todo && html`<${StartTodo} todo=${l.todo}/>`}</li>`)}</ul></div>`}
    <details><summary>Details: everything move-folder.py printed</summary><pre class="out">${done.said}</pre></details>
    <div class="row"><button class="primary" onClick=${close}>Close</button></div>`;
}

// The confirmation, as /move-check answered it (`shown`): into a client (`into`), what the folder is and where it goes; as a
// bucket, what it becomes, and for a lone repo the choice between its own project and the first project of a new bucket
// whose name is typed (`group`), checked on Enter or on leaving the field. Then what move-folder.py's dry run printed, and
// Move, only when the dry run ended well for what the confirmation shows. After Move, what the move printed. A modal
// <dialog>, opened when it is drawn; `inline` (the gallery) draws it open in place. `busy` ('checking' or 'moving'),
// `done` (the move's answer) and `typed` (the name field) are the gallery's.
export function MoveConfirm({ shown: first, close, inline, busy: givenBusy, done: givenDone, typed, accounts: givenAccts, repo: givenRepo }) {
  const box = useRef(), kinds = useId(), [shown, setShown] = useState(first), [busy, setBusy] = useState(givenBusy ?? ''), [done, setDone] = useState(givenDone ?? null);
  const [mode, setMode] = useState(first.group || typed !== undefined ? 'group' : 'own'), [name, setName] = useState(typed ?? first.group ?? '');
  useEffect(() => { if (!inline && !box.current.open) box.current.showModal(); }, []);
  // The repo form (a folder with no git repo): whether it is ticked, the accounts gh and glab are logged in as (read when it is first ticked), and the picks.
  const [repoOn, setRepoOn] = useState(givenRepo?.on ?? false), [accts, setAccts] = useState(givenAccts ?? null);
  const [rp, setRp] = useState({ host: 'github', owner: '', name: first.name, vis: 'private', ...givenRepo });
  const asked = mode === 'group' ? name.trim() : '', repoMore = repoMoreOf(repoOn, accts, rp), more = { group: asked, ...repoMore };
  // fresh: the dry run shown is for what is picked (a new bucket with no name yet is nothing checked); `at` is what the last one asked
  const [at, setAt] = useState(JSON.stringify({ group: first.group || '', ...repoMoreOf(givenRepo?.on, givenAccts, { host: 'github', owner: '', name: first.name, vis: 'private', ...givenRepo }) }));
  const fresh = at === JSON.stringify(more) && !(mode === 'group' && !asked);
  // One dry run at a time (the server refuses a second): a pick made while one runs is checked when it ends.
  const wanted = useRef(''), checking = useRef(false);
  const to = async m => {
    wanted.current = JSON.stringify(m);  // compared as text: the same pick twice (Enter, then the change event) is checked once
    if (checking.current) return;
    checking.current = true;
    setBusy('checking');
    let c, g;
    do c = await check(shown.bucket ? undefined : shown.folder, '/move-check', { into: shown.into, bucket: shown.bucket, ...JSON.parse(g = wanted.current) }); while (g !== wanted.current);
    checking.current = false;
    setAt(g);
    setShown(s => c?.place ? c : { ...s, group: JSON.parse(g).group, said: c?.refuse ?? NO_ANSWER, ok: false });  // a refused name keeps the rest
    setBusy('');
  };
  // A pick on the repo form: the dry run runs again, since the server checks the account and whether the name is taken.
  const change = (patch, on = repoOn, list = accts) => {
    const next = { ...rp, ...patch };
    setRp(next); setRepoOn(on);
    to({ group: asked, ...repoMoreOf(on, list, next) });
  };
  const loadAccts = async () => {
    setAccts(null);
    const r = await post('/repo-accounts').catch(() => null), list = r?.ok ? r.body : [];
    setAccts(list);
    to({ group: asked, ...repoMoreOf(true, list, rp) });
  };
  const tick = on => { setRepoOn(on); if (on && !accts) loadAccts(); else change({}, on); };
  const go = async () => {
    setBusy('moving');
    const r = await post('/move', { folder: shown.bucket ? undefined : shown.folder, into: shown.into, group: shown.group, bucket: shown.bucket, ...repoMore }).catch(() => ({ ok: false, body: NO_ANSWER }));
    setDone(r.ok ? r.body : { said: r.body, ok: false });
    setBusy('');
  };
  const where = s => s.into ? pretty(s.into) : 'the projects folder';
  let body;
  if (shown.waiting && shown.bucket) body = html`<h3>Checking…</h3><p>Sessia is checking what moving <b>${pretty(shown.bucket)}</b> into ${where(shown)} would change, which takes a few seconds.</p>`;
  else if (shown.waiting) body = html`<h3>Choose the folder</h3><p>Pick the folder to move into ${where(shown)} in the window macOS just opened. It may be behind the browser.
    Then Sessia checks what moving it would change, which takes a few seconds.</p>`;
  else if (shown.refuse) body = html`<h3>${shown.folder ? html`Can't move <code>${shown.shown}</code>` : "Can't add a folder"}</h3>
    <p class="refuse">${shown.refuse}</p><div class="row"><button class="primary" onClick=${close}>Close</button></div>`;
  else if (done?.ok && done.result) body = html`<${Result} shown=${shown} done=${done} close=${close}/>`;
  else if (done) body = html`<h3>${done.ok ? html`Moved to <code>${shown.placeShown}</code>` : html`<code>${shown.shown}</code> wasn't moved`}</h3>
    <p>${done.ok ? 'What move-folder.py said, with what still names the old path and whether Sessia lists the folder:' : 'What move-folder.py said:'}</p>
    <pre class="out">${done.said}</pre>
    <div class="row"><button class="primary" onClick=${close}>Close</button></div>`;
  else {
    const lone = !shown.into && shown.kind === 'repo', own = `${shown.rootShown}/${shown.name}`;
    const [moves, rest] = busy !== 'checking' && fresh ? split(shown.said) : [[], busy === 'checking' ? 'Checking…' : asked ? 'Press Enter to check this name.' : "Type the new bucket's name."];
    const repoExtra = shown.ok && fresh && repoMore.repo && shown.repoPlan && !shown.repoPlan.tooMany ? repoSteps(repoMore, shown.repoPlan) : [], steps = [...moves, ...repoExtra];
    const pick = m => { setMode(m); if (m === 'own' ? shown.group || checking.current : name.trim()) to({ group: m === 'own' ? '' : name.trim(), ...repoMore }); };
    const parts = shown.ok && shown.plan, plan = parts && busy !== 'checking' && fresh ? parts : null;
    body = html`<h3>Move <code>${parts ? shown.name : shown.shown}</code> ${shown.into ? `into ${pretty(shown.into)}` : 'in'}?</h3>
    ${shown.into ? html`${shown.kind !== 'repo' && html`<p class="note">Sessia won't show this folder in ${pretty(shown.into)}. ${pretty(shown.into)} is a client: a folder in the projects folder that holds git repos, and each repo shows as a column of its own. This folder has no git repo in it, so it would get no column. ${shown.repoPlan ? 'To get one, tick the box below to start a git repo for it.' : html`To get one, run <code>git init</code> in the folder before moving it.`} Or move it as plain files, which Sessia then doesn't list.</p>`}
      ${parts ? html`<${FromTo} from=${shown.shown} to=${shown.placeShown}/>${shown.kind === 'repo' && html`<p>It shows as a column of ${pretty(shown.into)}.</p>`}`
        : html`<p>It goes to <code>${shown.placeShown}</code>${shown.kind === 'repo' ? ` and shows as a column of ${pretty(shown.into)}` : ''}.</p>`}`
    : lone ? html`<fieldset class="kinds" disabled=${busy === 'moving'}><legend>It is one git repo. Make it</legend>
        <label><input type="radio" name=${kinds} checked=${mode === 'own'} onChange=${() => pick('own')}/><span><b>Its own project</b>, a bucket of its own: <code>${own}</code></span></label>
        <label><input type="radio" name=${kinds} checked=${mode === 'group'} onChange=${() => pick('group')}/><span><b>The first project of a new bucket</b> called <input type="text"
          class="group" value=${name} placeholder="name" aria-label="The new bucket's folder name" spellcheck="false" onFocus=${() => mode === 'own' && setMode('group')}
          onInput=${e => setName(e.target.value)} onChange=${e => e.target.value.trim() && to({ group: e.target.value.trim(), ...repoMore })}
          onKeyDown=${e => e.key === 'Enter' && e.target.value.trim() && to({ group: e.target.value.trim(), ...repoMore })}/>: <code>${shown.rootShown}/${name.trim() || '…'}/${shown.name}</code></span></label>
      </fieldset>${shown.alike?.length > 0 && html`<p class="why">${alike(shown)}</p>`}`
    : html`${becomes(shown)}${parts ? html`<${FromTo} from=${shown.shown} to=${shown.placeShown}/>` : html`<p>It goes to <code>${shown.placeShown}</code>.</p>`}`}
    ${shown.repoPlan?.tooMany && html`<p class="note">This folder has more than ${shown.repoPlan.limit} files, too many for Sessia to check them for secrets, so it can't start a git repo for it. Run <code>git init</code> in it yourself.</p>`}
    ${shown.repoPlan && !shown.repoPlan.tooMany && html`<${RepoForm} folder=${shown.name} plan=${shown.repoPlan} on=${repoOn} tick=${tick} accts=${accts} loadAccts=${loadAccts} rp=${rp} change=${change} setRp=${setRp} more=${repoMore} busy=${busy === 'moving'}/>`}
    ${plan ? html`<p class="why">Nothing has moved yet.</p><${Changes} plan=${plan} extra=${repoExtra.map(text => ({ group: 'A git repo', text, more: [] }))}/>
      ${plan.notes.map(n => html`<p class="why">${n}</p>`)}<${Still} left=${plan.left}/>
      ${shown.said && html`<details><summary>Details: everything the dry run printed</summary><pre class="out">${shown.said}</pre></details>`}`
    : html`<p>What Move will do, in this order (nothing has moved yet):</p>
    ${steps.length > 0 && html`<ol class="steps">${steps.map(t => html`<li>${t}</li>`)}</ol>`}
    ${rest && html`<pre class="out">${rest}</pre>`}`}
    <p class="said" role="status">${busy === 'moving' ? 'Moving: move-folder.py is running. This can take a minute…' : ''}</p>
    <div class="undo-foot"><p class="undo"><b>Nothing undoes a move.</b> It changes the folder's path in your Claude, git, ssh and shell files, and copies them to ~/.claude/move-backups/ first.</p>
      <div class="row"><button onClick=${close} disabled=${busy === 'moving'}>Cancel</button>${shown.ok && fresh && (!repoOn || repoMore.repo) && html`<button class="primary" id="move-go"
        onClick=${go} disabled=${!!busy}>${repoOn ? 'Move and start the repo' : 'Move'}</button>`}</div></div>`;
  }
  // While it moves, Esc is refused (onCancel), and a second Esc, which Chrome lets close a dialog anyway, opens it again: the move runs on, and its answer must be seen.
  return html`<dialog ref=${box} class="root-confirm move-confirm" open=${inline || undefined} aria-label="Move a folder into the projects folder"
    onCancel=${e => busy === 'moving' && e.preventDefault()} onClose=${() => busy === 'moving' ? box.current.showModal() : close()}>${body}</dialog>`;
}
