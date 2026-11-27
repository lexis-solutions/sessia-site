// The page's components: each tab moved out of dashboard.html is a module in its folder of sessia/, which exports
// `tab`, the component that draws the whole tab, and `fromPage`, its props from the page's state. That state is
// what dashboard.html's render() leaves in window.sessiaPage after each redraw, with an event, so these tabs follow
// the same data, buckets, search and pins as the tabs it still draws itself. Once every tab is here, this module
// fetches /data itself and dashboard.html goes.
import { render } from './vendor/preact.js';
import { html } from './core.js';
import * as scheduled from './scheduled/scheduled.js';
import * as code from './unsaved_code/code.js';

const TABS = { scheduled, code };  // by the id of the element each one draws into

function draw() {
  const page = window.sessiaPage;
  if (page) for (const [id, t] of Object.entries(TABS)) render(html`<${t.tab} ...${t.fromPage(page)}/>`, document.getElementById(id));
}
addEventListener('sessia:render', draw);
draw();  // a redraw that came before this module was loaded
