// The "Code not safe yet" tab: per repo, the branches not merged into its main branch, with commits only on this
// Mac or uncommitted files, and a main folder behind GitHub (unsaved_code() in __init__.py), one column per repo.
// Samples of each state are in samples.js, shown at /gallery.
import { ago, byProject, css, empty, hit, html, narrowIn, plural } from '../core.js';

css(import.meta.url, 'code.css');

// What the ⬇️ and 📝 tags mean, here and in the tooltip of the tab's red button in the menu (sessia/panel/panel.js).
export const BEHIND = 'A main folder is behind GitHub: something was merged on GitHub that this computer doesn’t have yet. '
  + 'Update the folder: in it, run git merge --ff-only origin/<its main branch>.';
export const UNCOMMITTED = 'A main folder has uncommitted changes. First check whose they are: a session or a person may be '
  + 'working there. Work belongs on a branch: commit it to one, or clear it, so the main folder stays clean.';

// One branch: its name, a tag for each way its work isn't safe yet, and its last commit, when, and its folder.
function branchRow({ branch: b, main }) {
  const note = `${b.subject} · ${ago(b.date)}${b.folder ? ' · in ' + b.folder : ''}`;
  return html`
    <li class="branch" title=${note}>
      <code>${b.name}</code>
      ${b.behind ? html` <span class="tag bad" title=${BEHIND}>${`⬇️ ${plural(b.behind, 'commit')} behind GitHub`}</span>` : ''}
      ${b.uncommitted ? html` <span class="tag bad" title=${b.isMain ? UNCOMMITTED : undefined}>${b.isMain ? `📝 ${plural(b.uncommitted, 'uncommitted file')} on the main branch` : plural(b.uncommitted, 'uncommitted file')}</span>` : ''}
      ${b.onlyHere ? html` <span class="tag warn" title=${`These commits are only on this computer, not on GitHub, so they’d be lost with it. ${b.isMain
        ? 'They’re on the main branch itself: move them to a branch and open a merge request, instead of pushing them to the main branch.'
        : 'Push the branch.'}`}>${`${plural(b.onlyHere, 'commit')} only on this Mac`}</span>` : ''}
      ${b.merged ? '' : html` <span class="tag" title=${`This branch’s work isn’t in ${main} yet. Open or merge its merge request, or delete the branch if it was abandoned.`}>${`not merged into ${main}`}</span>`}
      <div class="note">${note}</div>
    </li>`;
}

// One repo's card: the branches with a commit in the last 30 days, or uncommitted files, or behind GitHub, newest
// first, and the others in a fold under them.
export function codeCard({ repo }) {
  const monthAgo = Date.now() - 30 * 86400000;
  const branches = [...repo.branches].sort((a, b) => b.date - a.date);
  const recent = branches.filter(b => b.uncommitted || b.behind || b.date > monthAgo);
  const older = branches.filter(b => !recent.includes(b));
  const rows = list => html`<ul>${list.map(b => html`<${branchRow} key=${b.name} branch=${b} main=${repo.main}/>`)}</ul>`;
  return html`
    <div class="session">
      ${recent.length ? rows(recent) : ''}
      ${older.length ? html`<details><summary>${plural(older.length, 'branch', 'branches')} with no commit in 30 days</summary>${rows(older)}</details>` : ''}
    </div>`;
}

// The whole tab: `code` (/data's list of repos) narrowed to the search by repo, branch, commit subject and folder.
export function tab({ code, query, ...columns }) {
  const shown = narrowIn(query, code, 'branches', (r, b) => hit(query, r.repo, b.name, b.subject, b.folder));
  const card = r => html`<${codeCard} key=${`${r.bucket} ${r.repo}`} repo=${r}/>`;
  return shown.length ? byProject({ list: shown, project: 'repo', card, ...columns })
    : empty(query, 'Everything is committed, on GitHub and merged, and the main folders are up to date.');
}

// The tab's props from the page's state (main.js): the repos of the buckets shown.
export const fromPage = page => ({ code: page.view.code, query: page.query, picked: page.picked, pinned: page.pinnedProjects, facts: page.data.bucketFacts });
