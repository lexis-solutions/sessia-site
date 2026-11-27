// Sessia's website: the theme switch, the GitHub link and license in one place, the copy button, and the thin
// lines from each claim to the part of the live copy it describes. The live copy's own answers are in live/answers.js.

// The facts that change with the open-source release: change them here, and every link follows. While RELEASED is
// false (Sessia's repo is still private), what points to it is removed from the page: every [data-released]
// element (the GitHub links, both install commands, the license), and a short note stands there in its place.
const RELEASED = false;
const GITHUB = 'https://github.com/lexis-solutions/sessia';
const LICENSE = 'MIT';

for (const el of document.querySelectorAll(RELEASED ? '[data-unreleased]' : '[data-released]')) el.remove();

const root = document.documentElement;
const live = document.getElementById('live');

// GitHub opens in a new tab, so the site stays where the visitor was.
for (const a of document.querySelectorAll('[data-github]')) Object.assign(a, { href: GITHUB, target: '_blank', rel: 'noopener' });
for (const el of document.querySelectorAll('[data-license]')) el.textContent = LICENSE;
const clone = `git clone ${GITHUB}`;
for (const el of document.querySelectorAll('[data-clone], [data-clone-to]')) el.textContent = clone;

// The install command, on the first screen and in the Install steps, copies itself on a click, and says so for a
// moment in its own place. A screen reader hears it from one hidden status line, there from page load, because a
// line marked to be read out only as its text changes is often skipped. Where the clipboard API is missing (the site
// opened over plain http from another machine), the older execCommand copy does it; if that fails too, the command
// is selected, so ⌘C copies it.
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const back = document.activeElement, area = Object.assign(document.createElement('textarea'), { value: text });
  area.style.cssText = 'position:fixed;opacity:0';
  document.body.append(area);
  area.select();
  const done = document.execCommand('copy');
  area.remove();
  back?.focus();  // the keyboard stays on the button
  return done;
}
const status = document.createElement('span');
status.setAttribute('role', 'status');  // the attribute, as the role property is missing before Firefox 119
status.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
document.body.append(status);
for (const button of document.querySelectorAll('[data-copy-clone]')) {
  const code = button.querySelector('[data-clone], [data-clone-to]');
  let timer;
  button.addEventListener('click', async () => {
    if (!await copy(clone)) return getSelection().selectAllChildren(code);
    clearTimeout(timer);
    // The same width while it says so, so nothing next to it moves.
    button.style.minWidth = button.offsetWidth + 'px';
    code.textContent = 'Copied to the clipboard ✓';
    status.textContent = '';  // emptied first, so a second click is read out again
    setTimeout(() => status.textContent = 'Copied to the clipboard', 50);
    timer = setTimeout(() => { code.textContent = clone; button.style.minWidth = ''; status.textContent = ''; }, 1600);
  });
}

// The theme: the visitor's system setting until they click the switch, which overrides it and is remembered.
// Sessia's page in the live copy reads the same key, so it opens in the same theme, and follows a click here.
const dark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const button = document.getElementById('theme');
function label() { button.setAttribute('aria-label', `Switch to the ${dark() ? 'light' : 'dark'} theme`); }
function apply(theme) {
  theme === 'light' || theme === 'dark' ? root.dataset.theme = theme : delete root.dataset.theme;
  for (const frame of document.querySelectorAll('.window iframe')) {
    const doc = frame.contentDocument;
    if (!doc?.documentElement) continue;
    doc.documentElement.dataset.theme = theme || 'auto';
    const radio = doc.querySelector(`[name="theme"][value="${theme || 'auto'}"]`);
    if (radio) radio.checked = true;
  }
  label();
}
button.addEventListener('click', () => {
  const theme = dark() ? 'light' : 'dark';
  try { localStorage.setItem('theme', JSON.stringify(theme)); } catch {}
  apply(theme);
});
// A theme picked inside the live copy, which saves it under the same key, sets the site's too.
addEventListener('storage', e => {
  if (e.key !== 'theme') return;
  try { apply(JSON.parse(e.newValue)); } catch {}
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
label();

// The leader lines, on a wide screen: from each claim to its part of the live copy (claim 1 to a session card's
// status list, claim 2 to the Closed sessions and Code not safe yet rows of the menu). Drawn again when the
// window or the copy changes; a line whose target isn't on screen in the copy (another tab is open) is left out.
const svg = document.getElementById('leaders');
const LINES = [
  // The list's last row: the line then runs under the menu's rows, not through them.
  ['note-answers', doc => doc.querySelector('#running .session.needs ul li:last-child')],
  ['note-lost', doc => doc.querySelector('nav [data-tab="closed"]')],
  ['note-lost', doc => doc.querySelector('nav [data-tab="code"]')],
];
const NOTES = ['note-lost', 'note-answers'];  // top to bottom, as their targets are
// The copy is drawn scaled (style.css, --scale), so a place inside it is that much smaller out here.
const scale = () => live.getBoundingClientRect().width / live.offsetWidth;
function draw() {
  const doc = live.contentDocument;
  const wide = getComputedStyle(svg).display !== 'none';
  // Each note stands centred on the first thing it points at, below the note above it.
  let below = 0;
  for (const id of NOTES) {
    const note = document.getElementById(id), target = wide && doc ? LINES.find(l => l[0] === id)[1](doc) : null;
    const box = target?.getBoundingClientRect();
    const top = box?.height ? Math.max(live.parentNode.offsetTop + scale() * (box.top + box.height / 2) - note.offsetHeight / 2, below) : below;
    note.style.top = wide ? top + 'px' : '';
    below = top + note.offsetHeight + 28;
  }
  if (!doc || !wide) return;
  const base = svg.getBoundingClientRect(), frame = live.getBoundingClientRect();
  const parts = [];
  for (const [id, find] of LINES) {
    const target = find(doc);
    const note = document.getElementById(id).getBoundingClientRect();
    const box = target?.getBoundingClientRect();
    if (!box?.height || box.top < 0 || box.bottom * scale() > frame.height) continue;
    // From the note's right edge, level with the target when the note reaches that far, across the gap, then down
    // or up to the target's middle and into it a little, to a small dot.
    const x2 = frame.left - base.left + scale() * (box.left + 6), y2 = frame.top - base.top + scale() * (box.top + box.height / 2);
    const x1 = note.right - base.left + 10, y1 = Math.min(Math.max(y2, note.top - base.top + 11), note.bottom - base.top - 11);
    const xm = frame.left - base.left - 20;
    parts.push(`<path d="M${x1} ${y1}H${xm}L${xm + 12} ${y2}H${x2}"/><circle cx="${x2}" cy="${y2}" r="2.5"/>`);
  }
  svg.innerHTML = parts.join('');
}
// Every copy takes the site's theme once loaded, the sections' copies too.
for (const frame of document.querySelectorAll('.window iframe')) frame.addEventListener('load', () => apply(root.dataset.theme));
live.addEventListener('load', () => {
  const win = live.contentWindow;
  win.addEventListener('sessia:render', () => requestAnimationFrame(draw));
  win.addEventListener('scroll', draw, { passive: true });
  win.addEventListener('click', () => setTimeout(draw, 50));
  draw();
});
addEventListener('resize', draw);
