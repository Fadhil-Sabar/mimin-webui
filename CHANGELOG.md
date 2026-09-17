# Changelog

All notable changes to Mimin WebUI are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-09-17

A design-system pass: the visual language was sound but its edges had drifted, so this release consolidates the components, normalizes the tokens, and makes the theme actually hold on every surface.

### Added

- Skeleton loading states for the projects grid, skills grid, chat transcript and admin user list, built on the existing shimmer keyframe. They reuse `role="status"` with a single `aria-label` so the wait is announced once, and the gradient is dropped under `prefers-reduced-motion` instead of frozen.
- Route-level error pages for the root and the `(app)` group, sharing an `ErrorState` component. Without them a thrown load fell through to SvelteKit's unstyled default page.

### Changed

- Component consolidation: surfaces that hand-rolled their own controls now use the shared `Button`, `Input` and the new `Card` primitive. `UsersTab` alone carried four button styles; the global sheet carried six more. The installed primitives moved off `rounded-lg`, `h-8` and a box-shadow ring to match the project's radii and outline focus convention.
- Token normalization: hardcoded radii snapped to `--radius-*`, spacing onto `--space-*`, nine ad-hoc breakpoints collapsed onto a shared set, and roughly 15 property-less transition shorthands (which resolved to `all`) replaced with explicit property lists.
- Focus handling standardized onto the outline treatment, and the ~22 `outline: none` rules that were suppressing the global focus ring removed. Several inputs had been relying on a 1px border colour change as their only focus indicator.
- The Google Fonts request is now one call narrowed to the weights the MD3 scale actually uses (400 and 500, with Roboto's italic axis kept for `<em>` in transcripts and markdown).

### Fixed

- Escaped colour literals that assumed the light theme now derive from tokens (via `color-mix` where a tint is wanted), so the chat inline error, the incomplete-turn notice, the tool picker's status pill, the switch knob and the mockup preview read correctly on dark surfaces. The switch knob follows the MD3 pair in all four theme and state combinations.
- Sweeping every `var(--...)` reference against every definition also caught undefined tokens: `--border-hover`, `--success-text`, `--text-secondary`, `--bg-tertiary` and a bare `--radius` were never declared anywhere, and `ui/bubble` used shadcn v3 names (`--primary`, `--secondary`, `--muted`, `--foreground`) that this project's bridge never creates. Those rules were silently invalid CSS and the tinted bubble variant had no background at all.
- Warning boxes had no token either: two call sites used `--warning-bg` with a `--bg-tertiary` fallback, both undefined, so they drew a border with no fill. `--warning-bg` and `--warning-text` now sit beside the amber status family.
- Two layout regressions found by running the real app against a scratch database in headless Chromium (220 checks across 20 widths and 11 surfaces): the Users admin grid spilling past the dialog between 761 and 1024px, and the projects grid going 3-up where it had been 2-up between 761 and 800px.

## [0.3.0] - 2026-09-17

The release that makes a conversation survive a bad turn, and gives the interface Material's own motion.

### Added

- Image attachments in chat: paste from the clipboard or pick a file, validated by magic bytes, sent as image content rather than text, and served back through a conversation-scoped route so the transcript shows thumbnails. A model without vision fails the turn with an explicit message instead of answering as if it had seen the image.
- Recoverable turns: assistant messages record `turn_state` and `completed_at`, so a turn that dies mid-flight (dropped stream, provider error, restart) reads back as `interrupted` and offers a retry, while a deliberate Stop stays quiet.
- Superseded answers: regenerating a reply resolves the model first and keeps the replaced rows marked `superseded` instead of deleting them. They stay out of the transcript and out of the agent's context, but they are never destroyed.
- Context budgeting against the model's real context window instead of a fixed message count, with attachments prioritised newest-first and an explicit omitted marker when the budget runs out.
- Estimated generation rate (output tokens over the turn's wall clock) in the answer context, with a tooltip noting the estimate includes tool time.
- New Settings > Preferences page with a "Show answer context" toggle, stored per browser alongside theme, drafts and last-used model.
- Settings as an in-place modal with tabs, covering models, preferences, instructions, users, web search and the browser extension.
- Project file status: live processing state, open or download, "Ask about this file", and project skills listed inline with "Use in chat".

### Changed

- Feedback motion: hard-blinking status indicators (pulse dots, a `steps(2)` caret) replaced by a shimmer travelling across the label, plus a sine-fade caret. Labels keep their role colour as the gradient base, and the gradient is dropped under `prefers-reduced-motion` so nothing parks mid-animation.
- Motion system: roughly 40 hard-coded durations and easings replaced with Material Design 3 motion tokens in `@theme inline` (CSS only, no new dependency, no new chunks). Dialogs, alert dialogs, popovers, dropdowns, selects, sheets and tooltips move from Tailwind's stock 100/200 ms onto MD3 timings, and Material state layers (8% hover, 10% focus and press) land as a `::before` overlay in `@layer components`.
- The answer context summary moved from a collapsed block inside the reply bubble to a compact line in the message footer, sharing the row with the copy and regenerate actions, with the full breakdown kept as its tooltip. It now needs something substantive (tokens, duration, attachments, tool calls or sources) instead of appearing under every reply in a project.

### Fixed

- Message history could not be reached past the first page: the messages endpoint returned the oldest page and the chat page never sent a cursor. It now returns the newest page and walks backwards with `olderCursor`, and the page merges a page into the transcript instead of replacing it, so the reload after every turn no longer discards history the reader had paged in.
- Regenerating a reply no longer destroys the answer it was meant to replace when no model is available.
- Password reset links are no longer written to the server log; the admin console already copies them.

### Database

- `0021_overjoyed_runaways.sql`: adds `messages.turn_state` (text, default `complete`, not null) and `messages.completed_at` (timestamptz). Applied automatically on start when `AUTO_MIGRATE=true`.

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

[0.3.1]: https://github.com/Fadhil-Sabar/mimin-webui/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Fadhil-Sabar/mimin-webui/releases/tag/v0.3.0
[0.2.0]: https://github.com/Fadhil-Sabar/mimin-webui/releases/tag/v0.2.0
[0.1.0]: https://github.com/Fadhil-Sabar/mimin-webui/releases/tag/v0.1.0
