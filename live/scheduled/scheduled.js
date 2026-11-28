// The Scheduled tab: every repo's SCHEDULED.md items (scheduled() in __init__.py), one column per repo, soonest first,
// with overdue items in red. Samples of each state are in samples.js, shown at /gallery.
import { byProject, css, empty, hit, html, md, plural, start } from '../core.js';

css(import.meta.url, 'scheduled.css');

// Days from today to an item's YYYY-MM-DD date, in this Mac's time zone.
export const daysTo = d => Math.round((Date.parse(d) - Date.parse(new Date().toLocaleDateString('sv'))) / 86400000);

// One item. ▶️ opens a new Claude session in its repo with the item in the input box (start() in core.js, as the
// TODO and Bugs tabs do).
export function scheduledCard({ item: x }) {
  const n = x.date ? daysTo(x.date) : null;
  const when = n === null ? 'no date' : n < 0 ? `${plural(-n, 'day')} overdue` : n === 0 ? 'today' : `in ${plural(n, 'day')}`;
  return html`
    <div class="session ${n < 0 ? 'overdue' : n === 0 ? 'due' : ''}">
      <div class="top">
        <span class="title">${x.number ? `#${x.number}. ` : ''}${md(x.title)}</span>
        <span class="state">${n < 0 ? '⚠️ ' : ''}${x.date ? x.date + ' · ' : ''}${when}</span>
        <button class="start" onClick=${e => start(e.currentTarget, { kind: 'scheduled', bucket: x.bucket, repo: x.repo, number: x.number ?? '', title: x.title })}
          title="Open a new Claude session in ${x.repo}'s VS Code window, with this item in its input box">▶️</button>
      </div>
      ${x.body && html`<details><summary>What to do</summary><div class="note body">${md(x.body.replace(/^```.*\n?/gm, ''))}</div></details>`}
    </div>`;
}

// The whole tab: `items` narrowed to the search, soonest first, an item with no date last.
export function tab({ items, query, ...columns }) {
  const soonest = items.filter(x => hit(query, x.repo, x.number && '#' + x.number, x.date, x.title, x.body))
    .sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'));
  const card = x => html`<${scheduledCard} key=${`${x.number} ${x.date} ${x.title}`} item=${x}/>`;
  return soonest.length ? byProject({ list: soonest, project: 'repo', card, ...columns }) : empty(query, 'Nothing scheduled.');
}

// The tab's props from the page's state (main.js): the items of the buckets shown.
export const fromPage = page => ({ items: page.view.scheduled, query: page.query, picked: page.picked, pinned: page.pinnedProjects, facts: page.data.bucketFacts });
