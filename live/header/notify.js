// Notifications, from the switch in the header: the browser's own Notification API, which http://localhost may use,
// though a browser gives its permission only after a click. Without the permission, or with the switch off, the page
// works as before. watch() tells what changed: a session that starts waiting for you (a question or a permission), a
// turn that ends with a report (a decision, done or not done), a session that was working and stopped mid-work (it is
// gone from `sessions` and listed in `closed` as withoutClose), and a scheduled item whose time passes while the page is
// open. What the first look at the data finds (a session already waiting, an item already due) tells nothing.
import { BUCKETS, load, save } from '../core.js';

export const canNotify = 'Notification' in window;
export let notifyOn = load('notify', false) && canNotify && Notification.permission === 'granted';
let lastStates = {};  // session id -> its state at the previous look
const pending = new Set();  // scheduled items seen before their time

// Session id -> when its gold glow started; null while the notification that asked for it is unseen
// (the page hidden or on another tab), so the glow plays when it is looked at (glowing() in sessia/sessions/sessions.js).
// Emil Kirilov asked on 2026-11-18.
export const glowAt = {};

// When an item is due: its date at the time its title starts with ("09:00: …"), else at the start of its day.
const dueAt = x => {
  const time = /^(\d{1,2}):(\d{2})\b/.exec(x.title);
  return x.date ? new Date(`${x.date}T${time ? time[1].padStart(2, '0') + ':' + time[2] : '00:00'}`).getTime() : Infinity;
};

// The page's own sounds, so Sessia's notifications stand apart from Chrome's others: a notification
// can't choose its own sound. Emil Kirilov picked them on 2026-11-18 from eight: a soft bell when a
// session is done, a glass ping when it needs you. A browser lets a page play sound only once it has
// been clicked, so the first click on the page makes the AudioContext, and until then a notification
// comes without its sound (not with it late, on that click). Each note: frequency, start (s), length (s), loudness, attack (s), overtones.
const SOUNDS = {
  bell: [[1046.5, 0, 1.6, .05, .01, [[2, .2]]]],
  glass: [[1760, 0, 1.4, .03, .005, [[2.76, .25], [5.4, .08]]]],
};
let audio;
export function chime(sound) {
  if (audio?.state !== 'running') return;
  try {
    for (const [hz, start, len, vol, attack, overtones] of SOUNDS[sound])
      for (const [ratio, part] of [[1, 1], ...overtones]) {
        const at = audio.currentTime + start, osc = audio.createOscillator(), gain = audio.createGain();
        osc.frequency.value = hz * ratio;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(vol * part, at + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
        osc.connect(gain).connect(audio.destination);
        osc.start(at);
        osc.stop(at + len);
      }
  } catch {}
}
document.addEventListener('pointerdown', () => { try { audio = new AudioContext(); } catch {} }, { once: true });

// A notification closes itself after NOTIFY_MS (requireInteraction keeps the Mac from dropping it sooner).
// One timer per tag, so a replacement isn't closed by the timer of the notification it replaced.
const NOTIFY_MS = 10000, closeTimers = {};
// `session`: the id of a VS Code session the notification is about, which a click on it opens (see the comment at onclick).
function tell(title, body, tag, sound = 'glass', session = null) {
  if (!notifyOn || Notification.permission !== 'granted') return;
  chime(sound);
  // Every glass ping for a session (it needs you) makes its card glow gold on the page.
  if (sound === 'glass' && tag.startsWith('session ')) glowAt[tag.slice(8)] = null;
  try {  // some browsers (Android) refuse the constructor
    // renotify: a new one with the tag of one still on screen would otherwise replace it silently,
    // so a session's second question in a row showed nothing.
    const n = new Notification(title, { body, tag, renotify: true, requireInteraction: true });
    // A click on a session's notification opens its VS Code window and tab, as its card's Open does (2026-11-23). Bringing
    // this tab forward left Chrome in front but not the active app on macOS, so the page ignored the first clicks: see
    // "Notifications" in sessia/header/CLAUDE.md. preventDefault: no browser focus on this tab meanwhile. The click is the
    // look the glow waited for, so the card doesn't glow later. An Open that fails says so in a notification of its own,
    // since the page can't come forward once the click is over; any other notification brings the tab forward.
    n.onclick = e => {
      n.close();
      if (!session) return window.focus();
      e.preventDefault();
      delete glowAt[session];
      fetch('/open?session=' + encodeURIComponent(session), { method: 'POST' }).catch(() => null).then(async r => {
        if (!r?.ok) tell(`Couldn't open ${title}`, r ? await r.json().catch(() => r.status) : "The dashboard didn't answer", `open failed ${session}`);
      });
    };
    clearTimeout(closeTimers[tag]);
    closeTimers[tag] = setTimeout(() => n.close(), NOTIFY_MS);
  } catch {}
}

// Each poll of /data (`d`), compared with the one before; `picked` are the buckets shown, which alone may speak.
export function watch(d, picked) {
  for (const s of d.sessions) {
    if (lastStates[s.id] !== 'busy' || !picked.includes(s.bucket)) continue;  // another bucket is quiet, though its state is still tracked below
    // The title is the session's, as the page shows it; the text says what it wants, in one line.
    // A turn that ends tells by its report: a ⏳ line is a decision for you, else its 🟢 or 🔴 line.
    // Only 🟢 is the bell; the rest need you. A turn that ends without a report tells nothing.
    const ask = s.tasks.find(x => x.emoji === '⏳'), ended = s.ended ?? '', tag = `session ${s.id}`, open = s.vscode ? s.id : null;
    const plain = text => text.replace(/\*\*|`/g, '').replace(/^(🟢|🔴)\s*/u, '');  // no Markdown, no circle
    if (s.state === 'waiting') tell(s.title, s.wants || 'Needs you', tag, 'glass', open);
    else if (s.state !== 'idle' || !ended) continue;  // no report: the ⏳ line would be an older report's
    else if (ask) tell(s.title, `Decision: ${plain(ask.text)}`, tag, 'glass', open);
    else if (ended.startsWith('🟢')) tell(s.title, plain(ended), tag, 'bell', open);
    else if (ended.startsWith('🔴')) tell(s.title, plain(ended), tag, 'glass', open);
  }
  // A session that was working and is now listed as stopped mid-work died or was closed in its turn: the server reads
  // `sessions` and `closed` together, so both changes arrive in one poll. One that ended on a 🟢 report isn't withoutClose,
  // and one that wasn't busy at the previous look (idle on a report, or never seen: the first look) tells nothing.
  // Claude Code reports a closed tab and a crash alike (`unclosed()`), so a tab closed in the middle of a turn tells too.
  for (const s of d.closed)
    if (lastStates[s.id] === 'busy' && s.withoutClose && picked.includes(s.bucket)) tell(s.title, 'Stopped mid-work', `session ${s.id}`, 'glass', s.vscode ? s.id : null);
  lastStates = Object.fromEntries(d.sessions.map(s => [s.id, s.state]));
  for (const id in glowAt) if (!(id in lastStates)) delete glowAt[id];  // ended before its card was seen
  for (const x of d.scheduled) {
    const key = `${x.bucket} ${x.repo} ${x.number} ${x.date} ${x.title}`;
    if (dueAt(x) > Date.now()) pending.add(key);
    else if (pending.delete(key) && picked.includes(x.bucket)) tell(`Due: ${x.number ? `#${x.number}. ` : ''}${x.title}`, `${x.repo} · ${x.date}`, `due ${key}`);
  }
}

// The switch: the first click asks the browser for its permission, and a refusal is explained and leaves it off.
export async function toggleNotify() {
  if (!notifyOn && Notification.permission === 'default') await Notification.requestPermission();
  if (!notifyOn && Notification.permission !== 'granted')
    return alert("No notifications: the browser hasn't given this page permission. Allow them in its site settings (the icon left of the address), then click again.");
  notifyOn = !notifyOn;
  save('notify', notifyOn);
  // One at once, so it's clear right away whether Chrome and the Mac show them at all.
  if (notifyOn) tell('Notifications are on', `A session that needs you, in the ${BUCKETS} you picked, will show up like this.`, 'notify on');
}
