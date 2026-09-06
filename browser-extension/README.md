# Mimin Browser Bridge extension

Mimin Browser Bridge is an optional Manifest V3 extension for Chromium browsers and Firefox. It connects an enabled Mimin web app to a new browser tab: the app can ask it to open a public URL or search Google/Google Scholar, and it receives a bounded snapshot only for `www.google.com` and `scholar.google.com`.

The bridge accepts requests from the exact origins configured at build time. It does not inspect existing tabs, browsing history, accounts, or arbitrary websites. `browser_open` returns `readable: false` for public sites outside Google and Google Scholar.

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

Replies use `{ source: 'mimin-extension', id, ok, result, error }`. A successful Google or Google Scholar response contains `url`, `title`, `text`, `links`, `results`, `readable: true`, and `tabId`. An external page contains the same base fields with `readable: false` and a reason.

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
