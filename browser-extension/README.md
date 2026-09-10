# Mimin Browser Bridge extension

Mimin Browser Bridge is an optional Manifest V3 extension for Chromium browsers and Firefox. It connects an enabled Mimin web app to real browser tabs: the app can ask it to search Google/Google Scholar, open and read public HTTP/HTTPS web pages, and (after you approve it in the chat) read and interact with tabs you already have open.

The bridge distinguishes these search and browsing capabilities:

- **Web Search**: default server-side research via search providers (Tavily with DuckDuckGo fallback). Handled entirely on the server without touching the browser.
- **Browser Search**: explicit Google or Google Scholar search through the user's real browser. Only available when the user explicitly requests Google or Scholar. Returns structured results (`title`, `url`, `snippet`).
- **Browser Open**: opens and reads a specific public HTTP/HTTPS webpage through the user's real browser. Returns clean, bounded page content (`title`, `text`, `links`, `elements`).
- **Browser Tabs**: lists the open tabs the extension may describe (`tabId`, `title`, `url`, `active`, `pinned`, `readable`). The extension requests no `tabs` permission, so a tab without host permission reports `url_hidden` with no title or URL. That covers both internal browser pages and ordinary sites the user has not granted access to; the two are indistinguishable by design.
- **Browser Read Tab**: reads one tab by `tabId`, URL match, or the active tab. Returns the same bounded snapshot as Browser Open plus indexed interactive elements.
- **Browser Interact**: clicks, types, selects, presses keys, scrolls, navigates (`navigate`, `back`, `forward`, `reload`), or re-reads inside a tab. Targets elements by the `ref` from a snapshot, or by CSS selector / visible label.

Every snapshot returns `elements`, a bounded list of visible interactive elements (`ref`, `tag`, `name`, `type`, `disabled`, `selector`). The bridge keeps the resolved elements in the tab's isolated world so a follow-up action can use `ref` even if the page re-renders; the CSS `selector` is a fallback. Reads and interactions are wrapped in `<untrusted-browser-page>` markers when they reach the model, and clicking/typing is never treated as trusted instruction.

Mimin asks for the user's approval in the chat before the first tab access in a conversation: **allow just once** or **allow for this conversation**. The extension itself has no notion of that grant; it only enforces host permissions and allowed origins.

## Host permissions and privacy

- **Default host permissions**: `https://www.google.com/*` and `https://scholar.google.com/*`.
- **Optional host permissions**: `http://*/*` and `https://*/*` for reading public websites and the user's other tabs.
- **User-controlled grant**: Page reading and interaction are not enabled silently. The user must explicitly click **Grant** under **Tab reading & interaction** in the extension popup.
- If public website reading permission has not been granted, `browser_open` navigates to the page but returns `{ readable: false, reason: "host_permission_required" }`.
- Tab listing only returns tabs whose URLs the extension is permitted to see; internal pages (`chrome://`, `about:`, extensions) and private or local addresses are skipped. Reading a tab without host permission returns `{ readable: false, reason: "host_permission_required" }`.
- The bridge accepts requests only from the exact origins configured at build time (`MIMIN_EXTENSION_ORIGINS`). It never reads browsing history, cookies, accounts, or saved passwords.

The page protocol is:

```js
window.postMessage(
	{
		source: 'mimin-webui',
		id: 'request-id',
		action:
			| 'ping'
			| 'browser_search'
			| 'browser_open'
			| 'browser_tabs_list'
			| 'browser_tab_read'
			| 'browser_tab_interact',
		args: { engine, query, url, tabId, ref, selector, text }
	},
	window.location.origin
);
```

Replies use `{ source: 'mimin-extension', id, ok, result, error }`. A page response contains `url`, `title`, `text`, `links`, `elements`, `readable: true`, and `tabId` (along with structured `results` for Google / Google Scholar); a tab listing returns `{ tabs, tabId }`. If website reading permission is missing or reading fails, `readable: false` is returned with a machine-readable `reason`.

Runtime requirements: the popup must be granted **Tab reading & interaction** host permissions before Mimin can read or click in arbitrary tabs. Reload Mimin after granting so the bridge handshake reports the new capability.

## Build packages

```bash
npm run extension:build
```

This creates unpacked builds and downloadable ZIP archives in `static/extensions/`. Set `MIMIN_EXTENSION_ORIGINS` to a comma-separated list of exact app origins when building for a deployed Mimin instance, for example:

```bash
MIMIN_EXTENSION_ORIGINS=https://mimin.example.com npm run extension:build
```

## Test locally

### Verify the injected scripts in a real browser

Unit tests run the background handler against a mocked browser API, so they cannot check real CSS
selectors, real event dispatch, real computed styles, or real layout. The probe covers that seam:

```bash
npm run extension:probe
```

It extracts the shipped `pageSnapshot` and `interactPage` from `src/background-core.js`, serves
`probe/index.html` with them, and runs 35 self-checks on a page with buttons, inputs, a select, a
hidden input, and a `display:none` subtree. Open the printed URL and confirm the bottom line reads
`SUMMARY 35 passed, 0 failed`. Exit with Ctrl+C when done.

`tests/extension-probe.test.ts` guards the extraction, so renaming either function fails the unit
suite instead of silently disabling the probe.

### Automated end-to-end transport test

`tests/browser-e2e.test.ts` wires the real server bridge to the real extension background handler in
one process. The agent tool emits a `browser.request`, that exact event is dispatched to the shipped
background handler with only the browser API mocked, and the reply is validated against the
production result schema before settling the pending request. It covers listing, reading, clicking,
the consent gate (allowed once, denied, and a standing conversation grant), `browser_open`, tab
continuity, and the unreadable-tab path.

What it proves: the two halves agree on action names and argument shapes. What it does not cover:
loading the packed extension into a real browser against a running Mimin instance. For that final
step, install the package below, sign in to Mimin, and confirm the settings page reports
**Connected** before asking the agent to read a tab.

### Validate and load the packaged artifact

The unit tests check the manifests as data. Mozilla's validator checks the real packaged directory,
and it is the closest automated equivalent of a store review:

```bash
npm run extension:validate   # downloads web-ext on first use
```

Expect `errors 0`, `warnings 0`, `notices 0`. To confirm the package actually loads, launch it in a
temporary Firefox profile with [web-ext](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/):

```bash
npx --yes web-ext run --source-dir=static/extensions/firefox --url=http://localhost:5173/ --args=-headless
```

`Installed ... as a temporary add-on` means the manifest, background script, and content script all
loaded. This runs against a throwaway profile, so your own browser is untouched. Chrome cannot load
an unpacked extension from the command line on branded builds, so use the Chromium check below.

### End-to-end check in a real Chromium

```bash
npm run extension:build
npm run dev                 # in another terminal
npm run extension:e2e:chrome
```

This loads the packed Chrome build into a real Chromium through the DevTools Protocol (using Node's
built-in WebSocket, so there is nothing to install) and asserts the parts no unit test can reach:

- the MV3 service worker starts, which proves `background.chrome.js` -> `importScripts` works
- the content script injects on the real Mimin origin
- a real page -> extension `postMessage` round trip returns the bridge version
- `browser_tabs_list` refuses to leak private or localhost URLs
- `browser_open` opens and reads a live public page through the injected snapshot
- a private URL is rejected

Branded Google Chrome refuses `--load-extension` outright, and some Chrome for Testing builds ignore
it, so the script tries every Chromium it can find newest-first and reports which one worked. Set
`CHROME_PATH` to force a specific binary. Expect `SUMMARY 6 passed, 0 failed`.

Driving a full chat turn (login, send a message, answer the consent card) is not covered here: it
needs a configured model provider credential, which a bare checkout does not have.

Chrome, Edge, Brave, and other Chromium browsers:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `static/extensions/chrome`.

Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `static/extensions/firefox/manifest.json`.

Firefox removes temporary add-ons when the browser restarts. Publish and sign the package through Mozilla Add-ons for permanent installation and automatic updates. Likewise, publish the Chrome package through the Chrome Web Store for normal end-user installation.
