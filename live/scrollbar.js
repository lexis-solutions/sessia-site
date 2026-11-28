// The sideways scrollbar of every tab's row of columns, kept at the bottom of the window instead of under the longest column
// (which is somewhere in the middle of the screen), with a small line in each corner saying how many projects (columns) are
// out of sight on that side. Emil Kirilov asked for it on 2026-11-26.
//
// The row (.grid) hides its own scrollbar (page.css). Under it sits a bar that sticks to the bottom of the window and holds
// a second scrollbar of the same length, kept in step with the row both ways. Plain DOM, not a component: Preact only
// draws the columns inside .grid, and this adds its bar next to it, once.
const bar = grid => {
  const el = document.createElement('div');
  el.className = 'hbar';
  el.hidden = true;
  el.innerHTML = '<div class="hbar-scroll"><div></div></div><div class="hbar-text"><span></span><span></span></div>';
  grid.after(el);
  const scroll = el.firstChild, fill = scroll.firstChild, [left, right] = el.lastChild.children;
  const word = n => `${n} project${n === 1 ? '' : 's'} hidden`;

  // The row and the bar write each other's position, and a scroll event arrives a frame after the write that caused it, so a
  // swipe's momentum made the row and the bar overwrite each other with older positions: the row jiggled (Emil Kirilov, 2026-11-26).
  // `echo` is the one write that is waiting for its own event: that event is skipped instead of copied back.
  let echo = null;
  const echoed = el => { if (echo?.el === el && el.scrollLeft === echo.x) { echo = null; return true; } };
  const push = (from, to) => { if (to.scrollLeft !== from.scrollLeft) { to.scrollLeft = from.scrollLeft; echo = { el: to, x: to.scrollLeft }; } };
  const text = (span, t) => { if (span.textContent !== t) span.textContent = t; };  // a scroll event is no reason to touch the DOM

  const update = (mirror = true) => {
    const more = grid.scrollWidth > grid.clientWidth + 1;
    el.hidden = !more;
    if (!more) return;
    if (fill.style.width !== grid.scrollWidth + 'px') fill.style.width = grid.scrollWidth + 'px';
    if (mirror) push(grid, scroll);
    // A column is hidden on a side when none of it shows. The row's own 4px of room (page.css) is not part of the view.
    const view = grid.getBoundingClientRect();
    let before = 0, after = 0;
    for (const c of grid.children) {
      const r = c.getBoundingClientRect();
      if (!r.width || c.classList.contains('idle-list')) continue;  // the list of projects with no session (sessions/) is no project
      if (r.right <= view.left + 4) before++;
      else if (r.left >= view.right - 4) after++;
    }
    text(left, before ? '← ' + word(before) : '');
    text(right, after ? word(after) + ' →' : '');
  };
  grid.addEventListener('scroll', () => update(!echoed(grid)), { passive: true });
  scroll.addEventListener('scroll', () => { if (!echoed(scroll)) push(scroll, grid); }, { passive: true });
  // The columns change on every redraw; the row's width changes with the window, and from nothing when its tab is shown.
  new MutationObserver(() => update()).observe(grid, { childList: true });
  new ResizeObserver(() => update()).observe(grid);
  update();
};

for (const grid of document.querySelectorAll('[role="tabpanel"] > .grid')) bar(grid);
