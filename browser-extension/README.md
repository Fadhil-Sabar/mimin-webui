# Mimin Browser Bridge extension

Mimin Browser Bridge is an optional Manifest V3 extension for Chromium browsers and Firefox. It connects an enabled Mimin web app to real browser tabs: the app can ask it to search Google/Google Scholar or open and read public HTTP/HTTPS web pages.

The bridge distinguishes three search and browsing capabilities:

- **Web Search**: default server-side research via search providers (Tavily with DuckDuckGo fallback). Handled entirely on the server without touching the browser.
- **Browser Search**: explicit Google or Google Scholar search through the user's real browser. Only available when the user explicitly requests Google or Scholar. Returns structured results (`title`, `url`, `snippet`).
- **Browser Open**: opens and reads a specific public HTTP/HTTPS webpage through the user's real browser. Returns clean, bounded page content (`title`, `text`, `links`).

## Host permissions and privacy

- **Default host permissions**: `https://www.google.com/*` and `https://scholar.google.com/*`.
- **Optional host permissions**: `http://*/*` and `https://*/*` for reading generic public websites.
- **User-controlled grant**: Website reading is not enabled silently. The user must explicitly click **Grant** under **Public website reading** in the extension popup.
- If public website reading permission has not been granted, `browser_open` navigates to the page but returns `{ readable: false, reason: "host_permission_required" }`.
- The bridge accepts requests only from the exact origins configured at build time (`MIMIN_EXTENSION_ORIGINS`). It does not inspect existing tabs, browsing history, accounts, private network hosts, or local addresses.

The page protocol is:

```js
window.postMessage(
	{
		source: 'mimin-webui',
		id: 'request-id',
		action: 'ping' | 'browser_search' | 'browser_open',
		args: { engine, query, url }
	},
	window.location.origin
);
```

Replies use `{ source: 'mimin-extension', id, ok, result, error }`. A successful response contains `url`, `title`, `text`, `links`, `readable: true`, and `tabId` (along with structured `results` for Google / Google Scholar). If website reading permission is missing or reading fails, `readable: false` is returned with a machine-readable `reason`.

## Build packages

```bash
npm run extension:build
```

This creates unpacked builds and downloadable ZIP archives in `static/extensions/`. Set `MIMIN_EXTENSION_ORIGINS` to a comma-separated list of exact app origins when building for a deployed Mimin instance, for example:

```bash
MIMIN_EXTENSION_ORIGINS=https://mimin.example.com npm run extension:build
```

## Test locally

Chrome, Edge, Brave, and other Chromium browsers:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `static/extensions/chrome`.

Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `static/extensions/firefox/manifest.json`.

Firefox removes temporary add-ons when the browser restarts. Publish and sign the package through Mozilla Add-ons for permanent installation and automatic updates. Likewise, publish the Chrome package through the Chrome Web Store for normal end-user installation.
