# Changelog

All notable changes to Mimin WebUI are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-17

The release that turns the first working shell into a usable agent workspace: a visual canvas, project-wide knowledge search, real-page browsing tools, password reset, and a UI rebuilt on shadcn-svelte with the Material Design 3 type scale.

### Added

- Visual canvas workspace with export and reliable layout.
- Project-wide knowledge file search from chat.
- `web_fetch` tool for reading a specific public URL, and a browser bridge that reads and interacts with JavaScript-only pages behind an explicit chat consent prompt.
- Browser extension (0.4.1) that lets a turn drive real tabs, with the version single-sourced.
- Password reset through single-use, one-hour links: emailed when SMTP is configured, otherwise issued by an administrator.
- Assistant response actions on chat messages, collapsed to icon-only controls with hover tooltips.
- Draft preservation for chat input, including across onboarding, with validation of persisted values.
- Tool calls appear while their arguments are still streaming.
- Automatic continuation of turns truncated by the output budget.
- Material Design 3 type scale with Roboto, plus Sonner toasts and status badges.
- Room chat and settings workspace refinements.

### Changed

- UI migrated to shadcn-svelte primitives: dialogs, alert dialogs, tabs, popovers and pickers replaced the hand-rolled equivalents, and the app shell, sidebar, topbar and page chrome were unified.
- Oversized pages split into focused components, and the CSS that the migration obsoleted was deleted.
- `/api/tools` now requires a session and project ownership.

### Fixed

- Turns that end without an answer are reported instead of staying silent.
- Web search: poisoned DNS under Node bypassed, blocked and fallback results explained to the user, SearXNG fallback diagnostics isolated.
- Browser bridge: stops reporting interactions the site ignored as successes, acts on the page a navigation lands on, names fields the way snapshots do, keeps conversation tab continuity without adopting user tabs, builds the extension for the instance's real origin, and generates request ids without `crypto.randomUUID`.
- Chat message typography moved onto the MD3 scale.
- Picker geometry restored on mobile, refs bound to `null` instead of `undefined`, `@internationalized/date` restored, and generated Drizzle output excluded from Prettier.
- `SEED_PASSWORD` is applied when re-seeding.
- Modal, picker and dialog focus management and keyboard accessibility brought up to standard.

### Documentation

- Documented tool authorization, password reset and the browser fallback, the scope of the just-once tab grant, the conditions under which a snapshot is returned, and what a background tab can and cannot do without an extension.

### Tests

- Browser extension covered end to end: consent card, SSE wiring and client contract, consent timeout path and abort classifier, content-script relay and cross-realm errors, injected scripts against a real browser DOM, the packed extension in a real Chromium, and the real server bridge wired to the real extension handler.

## [0.1.0] - 2026-09-08

### Added

- Initial public release: project-based agent workspace with chat, project knowledge, model discovery, tool execution and persistent conversations.
- Email/password authentication with session cookies.
- Full performance pass over the initial implementation.

[0.2.0]: https://github.com/Fadhil-Sabar/mimin-webui/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Fadhil-Sabar/mimin-webui/releases/tag/v0.1.0
