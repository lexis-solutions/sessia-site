// The Worktrees tab: every branch's own folder under .worktrees/ (worktrees() in __init__.py), in a column for what its
// merge request says (Ongoing, Merged, Closed) and a fourth for the odd ones (Other), with a Delete button on those that
// are done. Samples of each state are in samples.js, shown at /gallery.
import { actions, ago, css, dur, empty, hit, html, plural, whose } from '../core.js';

css(import.meta.url, 'worktrees.css');

export const KB = kb => kb >= 1048576 ? (kb / 1048576).toFixed(1) + ' GB' : kb >= 1024 ? Math.round(kb / 1024) + ' MB' : kb + ' KB';
export const totalSize = list => {
  const known = list.filter(w => w.size != null), sum = known.reduce((n, w) => n + w.size, 0);
  return !list.length ? '' : !known.length ? 'counting sizes…' : KB(sum) + (known.length < list.length ? '+' : '');
};
const SESSION = s => s.running ? ['🔄', 'running'] : s.notClosed ? ['⚠️', 'stopped mid-work (no 🟢 report at the end)']
  : s.openTasks ? ['⚠️', 'open tasks in its last report'] : ['✅', 'closed'];

// A delete: the server checks again and answers with what it did, or why not (409).
async function deleteWorktree(bucket, repo, name) {
  const r = await fetch('/worktree-delete?' + new URLSearchParams({ bucket, repo, name }), { method: 'POST' }).catch(() => null);
  return r ? [r.ok, await r.json().catch(() => r.status)] : [false, "the dashboard didn't answer"];
}

// What a delete button does while it works and after: the label is the button's own text node (as in start() in
// core.js, so the redraw that follows finds it as it left it), and the page reads /data again either way. A failed
// delete puts the button back as it was.
async function deleting(button, run) {
  const label = button.firstChild, was = label.data;
  button.disabled = true;
  label.data = 'Deleting…';
  await run();
  button.disabled = false;
  label.data = was;
  actions.refresh();
}

function deleteOne(button, w) {
  if (!confirm(`Delete ${w.folder}${w.size ? ' (' + KB(w.size) + ')' : ''}?\n\nThe folder is removed${w.deleteBranch ? `, and so is the local branch ${w.branch}` : ', and the branch stays'}. `
    + 'GitHub keeps its copy of the branch.')) return;
  return deleting(button, async () => {
    const [ok, what] = await deleteWorktree(w.bucket, w.repo, w.name);
    if (!ok) alert('Not deleted: ' + what);
  });
}

function deleteAll(button, ready) {
  if (!confirm(`Delete these ${ready.length} merged worktrees and their local branches (${totalSize(ready)})?\n\n` + ready.map(w => w.folder).join('\n'))) return;
  return deleting(button, async () => {
    const failed = [];
    for (const w of ready) { const [ok, what] = await deleteWorktree(w.bucket, w.repo, w.name); if (!ok) failed.push(`${w.folder}: ${what}`); }
    if (failed.length) alert('Not deleted:\n' + failed.join('\n'));
  });
}

// One worktree: its branch, repo and why it is under Other; its merge request with how long it is open; its folder, last
// commit and size; the sessions that ran there; and Delete (Forget when the folder is gone), disabled with what stands in the way.
export function worktreeCard({ w, picked }) {
  const mr = w.mr && html`<a href=${w.mr.url} target="_blank" rel="noopener">${w.mr.ref} ${w.mr.title}</a> ${
    w.mr.state === 'open' && w.mr.created  // how long it has been open, the exact date on hover
      ? html`<span class="tag" title=${`Opened ${new Date(w.mr.created).toLocaleString()}`}>${`open for ${dur(w.mr.created)}`}</span>`
      : html`<span class="tag">${w.mr.state}</span>`}${
    w.mr.state === 'merged' && w.group === 'ongoing' ? html` <span class="tag warn">commits added after the merge</span>` : ''}${
    w.mr.state === 'closed' && w.group === 'ongoing' ? html` <span class="tag warn">made from another commit: an older branch of this name?</span>` : ''}`;
  const none = !w.mr && w.branch && html`<span class="tag">${w.mrKnown ? 'no merge request' : 'merge requests not read yet'}</span>`;
  const del = w.group !== 'ongoing';
  return html`
    <div class="session wt">
      <div class="top">
        <span class="title" title=${w.subject}><code>${w.branch ?? w.name}</code> <span class="tag">${w.repo ? whose(picked, w.bucket, w.repo) : 'no repo'}</span>
          ${w.why && html` <span class="tag warn">${w.why}</span>`}</span>
        ${del && html`<button disabled=${!w.deletable} onClick=${e => deleteOne(e.currentTarget, w)}>${w.missing ? 'Forget' : 'Delete'}</button>`}
      </div>
      ${(mr || none) && html`<div class="note">${mr || none}</div>`}
      <div class="note">${`${w.folder} · ${w.date ? 'last commit ' + ago(w.date) + ' · ' : ''}${w.size != null ? KB(w.size) : 'counting size…'}`}</div>
      ${w.sessions.length > 0 && html`<ul>${w.sessions.map(s => { const [emoji, what] = SESSION(s);
        return html`<li key=${s.id}><span class="emoji">${emoji}</span><span>${s.title} <span class="note">· ${what}</span></span></li>`; })}</ul>`}
      ${del && !w.deletable && w.blockers.length > 0 && html`<div class="note why">Can't delete yet: ${w.blockers.join('; ')}.</div>`}
    </div>`;
}

// One column: its worktrees, their count and total size, and in Merged the button that deletes every one that passes the checks.
function Column({ title, group, list, picked }) {
  const here = list.filter(w => w.group === group), ready = here.filter(w => w.deletable);
  return html`<section key=${group}><h2>${title}<span class="count">${here.length}</span><span class="size">${totalSize(here)}</span>${group === 'merged' && html`<button
    disabled=${!ready.length} title=${`Delete the ${plural(ready.length, 'merged worktree')} that pass the checks`}
    onClick=${e => deleteAll(e.currentTarget, ready)}>${`Delete ${ready.length} that pass the checks`}</button>`}</h2>
    ${here.map(w => html`<${worktreeCard} key=${`${w.bucket} ${w.repo} ${w.name}`} w=${w} picked=${picked}/>`)}
    ${!here.length && html`<p class="empty">None.</p>`}</section>`;
}

// The whole tab: the merge requests that couldn't be read (`errors`, repo name to what gh said), then `worktrees`
// narrowed to the search by repo, branch and folder, in the columns.
export function tab({ worktrees, errors, query, picked }) {
  const bad = Object.entries(errors);
  const list = worktrees.filter(w => hit(query, w.repo, w.branch, w.name, w.folder));
  const other = list.some(w => w.group === 'other');
  const col = (title, group) => html`<${Column} title=${title} group=${group} list=${list} picked=${picked}/>`;
  return html`
    ${bad.length > 0 && html`<p class="crash">⚠️ The merge requests of ${bad.map(([r, e]) => `${r} (${e})`).join(', ')} couldn't be read,
      so its closed branches show as ongoing there. The last list that worked is used while it fails.</p>`}
    ${list.length ? html`<div class="grid columns">${col('Ongoing', 'ongoing')}${col('Merged', 'merged')}${col('Closed', 'closed')}${other && col('Other', 'other')}</div>`
      : empty(query, 'No worktrees.')}`;
}

// The tab's props from the page's state (main.js): the worktrees of the buckets shown, and their repos' merge request errors.
export const fromPage = page => ({ worktrees: page.view.worktrees, errors: page.view.mrErrors, query: page.query, picked: page.picked });
