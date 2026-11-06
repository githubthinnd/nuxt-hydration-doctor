/**
 * The Nuxt DevTools tab: a small self-contained page shown in an iframe.
 *
 * Plain HTML, CSS and JavaScript, three separate files, so the page can be served with a CSP that
 * forbids inline script (see `router.ts`). Everything that came from the application under test
 * (messages, markup, file names) is put in the page with `textContent`/text nodes only, never
 * parsed as HTML.
 */

/** Where the dev handler is mounted (shared with the browser runtime through the domain). */
export { DEVTOOLS_BASE_PATH as DEVTOOLS_BASE } from '../runtime/domain/constants';

export const ASSET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Hydration Doctor</title>
<link rel="stylesheet" href="/__nhd/style.css">
</head>
<body>
<header class="bar">
  <h1><svg class="logo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2.5-6 4 12 2.5-6H21"/></svg>Hydration Doctor</h1>
  <span id="status" role="status"></span>
  <button id="clear" type="button">Clear history</button>
</header>
<main id="list" aria-live="polite"></main>
<div id="toast" role="status" hidden></div>
<script src="/__nhd/app.js"></script>
</body>
</html>
`;

export const ASSET_CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --surface: #fafafb; --raised: #f1f2f5; --hover: #e8eaef;
  --border: #e1e4ea; --border-strong: #c7ccd6;
  --text: #15171c; --muted: #525a6b; --faint: #7b8394;
  --accent: #d6204a; --accent-soft: rgba(214, 32, 74, 0.09);
  --info: #1d5fd1; --info-soft: rgba(29, 95, 209, 0.09);
  --ok: #107a4c; --ok-soft: rgba(16, 122, 76, 0.1);
  --warn: #8a5a00; --warn-soft: rgba(176, 116, 0, 0.12);
  --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0c0e12; --surface: #12151b; --raised: #1a1e26; --hover: #222731;
    --border: #262b35; --border-strong: #394050;
    --text: #eceef2; --muted: #9aa2b1; --faint: #6b7385;
    --accent: #ff5d73; --accent-soft: rgba(255, 93, 115, 0.14);
    --info: #6ea8ff; --info-soft: rgba(110, 168, 255, 0.14);
    --ok: #3ddc97; --ok-soft: rgba(61, 220, 151, 0.14);
    --warn: #ffc857; --warn-soft: rgba(255, 200, 87, 0.14);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
button { font: inherit; font-size: 12px; font-weight: 550; color: inherit; cursor: pointer; height: 28px; padding: 0 11px; border: 1px solid var(--border); border-radius: 7px; background: var(--raised); transition: background-color .12s, border-color .12s; }
button:hover { background: var(--hover); border-color: var(--border-strong); }
button:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }
.bar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: var(--surface); border-bottom: 1px solid var(--border); }
.bar h1 { display: flex; align-items: center; gap: 10px; margin: 0 auto 0 0; font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
.logo { color: var(--accent); }
#status { padding: 2px 10px; border-radius: 999px; background: var(--raised); color: var(--muted); font-size: 12px; font-weight: 550; }
#status:empty { display: none; }
#status.error { background: var(--accent-soft); color: var(--accent); }
main { max-width: 980px; margin: 0 auto; padding: 8px 20px 48px; }
.empty { margin: 0; padding: 48px 12px; text-align: center; color: var(--muted); }
.group-title { margin: 22px 0 10px; font-size: 11px; font-weight: 650; color: var(--faint); text-transform: uppercase; letter-spacing: .06em; }
.card { margin: 0 0 14px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.card h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
.card h2::before { content: ''; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.meta { display: grid; grid-template-columns: max-content 1fr; align-items: center; gap: 6px 18px; margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); }
.meta dt { color: var(--faint); font-size: 12px; }
.meta dd { margin: 0; word-break: break-word; }
.actions { display: inline-flex; flex-wrap: wrap; gap: 6px; margin-left: 8px; }
code, pre { font: 12px/1.6 var(--mono); }
code { padding: 2px 6px; border-radius: 5px; background: var(--raised); }
pre { margin: 0 0 8px; padding: 10px 12px; overflow-x: auto; white-space: pre; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
pre.message { white-space: pre-wrap; word-break: break-word; border-left: 3px solid var(--accent); background: var(--bg); }
.crumbs { display: flex; flex-wrap: wrap; margin: 0 0 14px; padding: 0; list-style: none; color: var(--muted); font: 11.5px/1.5 var(--mono); }
.crumbs li + li::before { content: '\\203A'; margin: 0 6px; color: var(--faint); }
.diag { margin: 0 0 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); }
.diag h3 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0 0 6px; font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
.diag .confidence { padding: 1px 8px; border-radius: 999px; background: var(--info-soft); color: var(--info); font-size: 11px; font-weight: 600; letter-spacing: 0; white-space: nowrap; }
.diag .confidence.high { background: var(--ok-soft); color: var(--ok); }
.diag .confidence.medium { background: var(--warn-soft); color: var(--warn); }
.diag p { margin: 0 0 8px; }
.diag ul { margin: 0 0 10px; padding: 0; list-style: none; color: var(--muted); font-size: 12px; }
.diag li { position: relative; padding: 2px 0 2px 16px; }
.diag li::before { content: ''; position: absolute; left: 3px; top: 9px; width: 5px; height: 5px; border-radius: 50%; background: var(--info); }
details { margin: 4px 0 0; }
summary { cursor: pointer; color: var(--muted); font-size: 12px; font-weight: 550; }
summary:hover { color: var(--text); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-top: 8px; }
.pair h4 { margin: 0 0 6px; font-size: 12px; color: var(--muted); }
#toast { position: fixed; right: 20px; bottom: 20px; padding: 9px 14px; border-radius: 8px; background: var(--text); color: var(--bg); font-weight: 550; box-shadow: 0 8px 24px rgba(0, 0, 0, .25); }
@media (max-width: 560px) { .meta { grid-template-columns: 1fr; gap: 0; } .meta dd { margin-bottom: 8px; } }
`;

export const ASSET_JS = `(function () {
  'use strict';
  var BASE = '/__nhd';
  var HEADERS = { 'x-nhd-client': '1' };
  var KIND = {
    'text-mismatch': 'Text mismatch',
    'node-mismatch': 'Node mismatch',
    'children-mismatch': 'Children mismatch',
    'class-mismatch': 'Class mismatch',
    'style-mismatch': 'Style mismatch',
    'attribute-mismatch': 'Attribute mismatch'
  };

  var list = document.getElementById('list');
  var statusEl = document.getElementById('status');
  var clearButton = document.getElementById('clear');
  var toastEl = document.getElementById('toast');
  var reports = [];
  var latest = 0;
  var generation = null;
  var epoch = null;
  var blocked = false;
  var toastTimer = null;

  // Builds an element. Strings become text nodes, so nothing is ever parsed as markup.
  function h(tag, className, children) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.className = isError ? 'error' : '';
  }

  function confidenceLevel(value) {
    if (value >= 0.8) return 'high';
    if (value >= 0.55) return 'medium';
    return 'low';
  }

  function confidenceWord(value) {
    if (value >= 0.8) return 'High confidence';
    if (value >= 0.55) return 'Medium confidence';
    return 'Low confidence';
  }

  function copy(value) {
    if (!navigator.clipboard) { toast('Clipboard unavailable'); return; }
    navigator.clipboard.writeText(value).then(
      function () { toast('Copied'); },
      function () { toast('Copy failed'); }
    );
  }

  function openInEditor(report) {
    var location = report.issue.location;
    if (!report.editorFile || !location) return;
    var target = report.editorFile + ':' + location.line + ':' + location.column;
    fetch('/__open-in-editor?file=' + encodeURIComponent(target), { headers: HEADERS }).then(
      function (response) { toast(response.ok ? 'Opened in your editor' : 'Could not open the editor'); },
      function () { toast('Could not open the editor'); }
    );
  }

  function button(label, onClick) {
    var node = h('button', null, [label]);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function meta(label, value) {
    return [h('dt', null, [label]), h('dd', null, Array.isArray(value) ? value : [value])];
  }

  function diagnosis(item) {
    var parts = [
      h('h3', null, [
        item.title,
        h('span', 'confidence ' + confidenceLevel(item.confidence), [confidenceWord(item.confidence) + ' \\u00b7 ' + Math.round(item.confidence * 100) + '%'])
      ]),
      h('p', null, [item.explanation])
    ];
    if (item.evidence.length > 0) {
      parts.push(h('ul', null, item.evidence.map(function (line) { return h('li', null, [line]); })));
    }
    if (item.fix) {
      parts.push(h('p', null, [item.fix.description]));
      parts.push(h('pre', null, [item.fix.code]));
      parts.push(button('Copy fix', function () { copy(item.fix.code); }));
    }
    return h('article', 'diag', parts);
  }

  function card(report) {
    var issue = report.issue;
    var location = issue.location;
    var source = location
      ? [
          h('code', null, [location.file + ':' + location.line + ':' + location.column]),
          h('span', 'actions', [
            report.editorFile ? button('Open in editor', function () { openInEditor(report); }) : null,
            button('Copy', function () { copy(location.file + ':' + location.line + ':' + location.column); })
          ])
        ]
      : 'Unknown (no source location on this element)';
    var metrics = issue.metrics.msSinceNavigationStart === null
      ? 'time unavailable'
      : Math.round(issue.metrics.msSinceNavigationStart) + ' ms after navigation start';

    var parts = [
      h('h2', null, [(KIND[issue.kind] || issue.kind) + ' \\u00b7 ' + (issue.componentName || 'Unknown component')]),
      h('dl', 'meta', [].concat(
        meta('Source', source),
        meta('Route', issue.route),
        meta('Detected', metrics),
        meta('Received', new Date(report.receivedAt).toLocaleTimeString())
      )),
      h('pre', 'message', [issue.message])
    ];
    if (issue.breadcrumbs.length > 0) {
      parts.push(h('ol', 'crumbs', issue.breadcrumbs.map(function (crumb) { return h('li', null, [crumb]); })));
    }
    if (report.diagnostics.length > 0) {
      parts.push(h('div', null, report.diagnostics.map(diagnosis)));
    } else {
      parts.push(h('p', 'empty', ['No known pattern matched this mismatch.']));
    }
    if (issue.serverHtml !== null || issue.clientHtml !== null) {
      parts.push(h('details', null, [
        h('summary', null, ['Server and client markup']),
        h('div', 'pair', [
          h('div', null, [h('h4', null, ['Server Rendered HTML']), h('pre', null, [issue.serverHtml === null ? '(unavailable)' : issue.serverHtml])]),
          h('div', null, [h('h4', null, ['Client Rendered DOM']), h('pre', null, [issue.clientHtml === null ? '(unavailable)' : issue.clientHtml])])
        ])
      ]));
    }
    return h('article', 'card', parts);
  }

  function render() {
    list.textContent = '';
    if (reports.length === 0) {
      list.appendChild(h('p', 'empty', ['No hydration mismatches reported yet. Load a page of your app in development.']));
      return;
    }
    // A Map, not an object: page load ids come from the browser, and "__proto__" or "constructor"
    // must be ordinary keys, not properties of the object.
    var groups = new Map();
    reports.forEach(function (report) {
      var group = groups.get(report.pageLoadId);
      if (!group) { group = []; groups.set(report.pageLoadId, group); }
      group.push(report);
    });
    Array.from(groups.keys()).reverse().forEach(function (id) {
      var items = groups.get(id).slice().reverse();
      list.appendChild(h('h2', 'group-title', ['Page load ' + id + ' \\u00b7 ' + items.length + (items.length === 1 ? ' issue' : ' issues')]));
      items.forEach(function (report) { list.appendChild(card(report)); });
    });
  }

  function poll() {
    return fetch(BASE + '/issues?since=' + latest, { headers: HEADERS, cache: 'no-store' })
      .then(function (response) {
        blocked = response.status === 403;
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.reports)) throw new Error('Unexpected response');
        if ((generation !== null && data.generation !== generation) || (epoch !== null && data.epoch !== epoch)) {
          // The history was cleared elsewhere, or the dev server restarted and counts from zero
          // again: start over from the server's current state.
          epoch = data.epoch;
          generation = data.generation;
          reports = [];
          latest = 0;
          render();
          return poll();
        }
        epoch = data.epoch;
        generation = data.generation;
        if (data.reports.length > 0) {
          reports = reports.concat(data.reports);
          latest = data.latest;
          render();
        }
        setStatus(reports.length + (reports.length === 1 ? ' report' : ' reports'), false);
        return undefined;
      })
      .catch(function () {
        setStatus(
          blocked
            ? 'The dev endpoint refused this address. Open the app through localhost or an IP address, or add the host name to devServer.host or vite.server.allowedHosts.'
            : 'Cannot reach the dev server',
          true
        );
      });
  }

  clearButton.addEventListener('click', function () {
    fetch(BASE + '/issues', { method: 'DELETE', headers: HEADERS }).then(function () {
      reports = [];
      render();
      return poll();
    }, function () { toast('Could not clear the history'); });
  });

  render();
  window.__nhdDevtools = { poll: poll };
  poll();
  setInterval(function () { if (!document.hidden) poll(); }, 1500);
})();
`;
