// The site's own part of the live copy (the rest is Sessia's page, copied by tools/copy-live.py). It runs before
// the page's scripts and stands in for Sessia's server: /data comes from the recording of the demo with made-up
// data, with its times moved to now, and every action is refused with a short note of what it does in your own copy.
(() => {
  const NOTES = {
    '/open': 'In your own copy this opens the session in its VS Code window.',
    '/start': 'In your own copy this starts a Claude session on the item, with its text ready to send.',
    '/priority': "In your own copy this changes the item's priority in its file on GitHub.",
    '/worktree-delete': 'In your own copy this deletes the folder, after its checks.',
    '/productivity': 'In your own copy this counts the hours again.',
    notify: 'In your own copy this turns on notifications, with a sound, when a session needs you.',
  };
  const recorded = fetch('data.json').then(r => r.text()).then(text => {
    // The recording's clock: its newest time. Every time in it moves by the same amount, so "2 minutes ago" stays
    // true; a date alone (a scheduled item's) moves by whole days.
    const iso = /\d{4}-\d\d-\d\d(T\d\d:\d\d:\d\d(\.\d+)?Z)?/g, ms = /\b1[78]\d{11}\b/g;
    const then = Math.max(...(text.match(iso) || []).filter(t => t.includes('T')).map(Date.parse));
    const shift = Date.now() - then, days = Math.round(shift / 864e5) * 864e5;
    return text
      .replace(iso, t => new Date(Date.parse(t) + (t.includes('T') ? shift : days)).toISOString().slice(0, t.includes('T') ? 24 : 10))
      .replace(ms, n => String(+n + shift));
  });

  let note = '';
  function tell(text) {
    note = text;
    let el = document.getElementById('live-note');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'live-note', role: 'status' });
      document.body.append(el);
    }
    el.textContent = text;
    el.hidden = false;
    clearTimeout(tell.t);
    tell.t = setTimeout(() => el.hidden = true, 4000);
  }

  const real = window.fetch;
  window.fetch = async (url, init) => {
    const path = new URL(url, location.href).pathname.replace(/.*(?=\/[^/]+$)/, '');
    if (path === '/data') return new Response(await recorded, { headers: { 'Content-Type': 'application/json' } });
    if (NOTES[path]) {
      tell(NOTES[path]);
      return new Response(JSON.stringify(NOTES[path]), { status: 409 });
    }
    return real(url, init);
  };
  // The page explains a refused action with alert(); the note above already said it, without a dialog.
  window.alert = text => tell(note || text);
  // No real notifications from a website: the switch only says what it does.
  if ('Notification' in window) Notification.requestPermission = async () => (tell(NOTES.notify), 'denied');

  // The first visit shows the demo's fullest client, with its shop project and the session that waits for a
  // decision pinned in front, so the site's first screen can point at that session's status list.
  const FIRST = { buckets: '["northwind"]', pinnedProjects: '["shop"]', pinned: '{"s2":true}' };
  // A section's copy further down the site (live/?tab=todo, &menu for the project menu open) opens on its tab and
  // keeps its settings to itself, in memory, so it never changes the tab, projects or pins picked in another copy.
  // Only the theme is shared, as the site's own switch sets it for every copy.
  const query = new URLSearchParams(location.search), own = query.get('tab');
  let stored;
  try { stored = localStorage; } catch {}
  if (own) {
    const mine = new Map(Object.entries({ ...FIRST, tab: JSON.stringify(own) }));
    const shared = k => k === 'theme' && stored;
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: k => shared(k) ? stored.getItem(k) : mine.get(k) ?? null,
      setItem: (k, v) => shared(k) ? stored.setItem(k, v) : mine.set(k, String(v)),
      removeItem: k => shared(k) ? stored.removeItem(k) : mine.delete(k),
    } });
    if (query.has('menu')) addEventListener('sessia:render', () => {
      const menu = document.getElementById('bucket-menu');
      menu.showPopover();
      document.activeElement.blur();  // the page focuses the menu's ticked row; a picture must not take the focus
    }, { once: true });
  } else try {
    if (!stored.getItem('buckets')) for (const [k, v] of Object.entries(FIRST)) stored.setItem(k, v);
  } catch {}
  // The Closed sessions tab's help text is hidden while it still tells you to type "close", a word Sessia retired
  // (Sessia's BUGS.md).
  document.head.append(Object.assign(document.createElement('style'), { textContent: `
    #panel-closed .intro { display: none; }
    #live-note { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 9;
      max-width: calc(100% - 32px); padding: 10px 14px; border-radius: 8px; font: 13px/1.4 system-ui, sans-serif;
      background: light-dark(#1d1d1b, #ecebe7); color: light-dark(#fff, #0e0e0d); }
  ` }));
})();
