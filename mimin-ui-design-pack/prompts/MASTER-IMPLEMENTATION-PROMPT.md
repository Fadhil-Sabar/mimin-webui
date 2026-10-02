# Master implementation prompt

Use this prompt with the 13 PNGs in `screens/`. The PNGs are visual references, not screenshots of implemented features.

```text
Implement the Mimin UI redesign using the accompanying current screen references. Work in the existing application and preserve its stack, routes, API contracts, data, authentication, permissions and working behavior. Inspect the repository and its instructions before changing code. If no repository is available, create a frontend prototype with explicitly labeled sample data and simulated interactions.

Build reusable components and design tokens rather than hardcoding each screenshot. Keep the design minimal, elegant, dark zinc and monochrome. Use flat matte surfaces with soft exterior shadows. Do not use bevels, inset shadows, glossy lighting, frosted glass, decorative gradients or 3D hero art. Earlier explorations are historical only and must not override the current screen references.

STYLE AND LAYOUT
- Use design-tokens.json as starting values, then tune by visual comparison. These are proposed implementation values, not measured pixel specifications.
- Narrow floating navigation dock: new chat, chats, projects, skills, settings and profile. Clearly identify the active page. Provide accessible names and hover/focus tooltips for icon-only buttons. Recent history must remain accessible through a drawer or conversation list.
- Flat charcoal cards, subtle borders, off-white primary buttons and readable muted text. Use a single icon family and consistent type/spacing scales.
- Keep the background and global shell identical across settings views; generated backgrounds contain incidental inconsistencies that should not be copied.
- Main content is centered with a comfortable maximum width. Chat text uses a narrower reading column. The composer remains visible at the bottom without covering messages.

SCREENS
1. Home: greeting and one composer. Attachments, context selection, model selection and send stay available.
2. Projects: search, grid/list view, project cards and one create action.
3. Skills: All/Personal/Project filters, search, cards, editing and secondary actions in overflow.
4. Chat: user/assistant messages, collapsible thinking section, copy/retry/branch/edit access, Canvas access, contextual composer. Place diagnostics in details by default and respect the answer-context preference.
5. Project detail: Conversations, Knowledge, Canvas, Instructions and Skills tabs. Keep every original upload/download, file action, canvas action, instruction editor, skill management and conversation action available in its relevant tab. The reference depicts the default Conversations tab only; implement other tabs from the existing app rather than dropping them.
6. Skill editor: Details, Tools and Triggers tabs. Preserve complete existing instructions and all tool/trigger controls. Never replace the full skill with the short screenshot excerpt. Keep Save/Cancel reachable in a fixed footer, scroll the body when needed, and preserve unsaved changes when switching tabs.
7. Settings/providers: connected and available providers, add/connect/manage, removal in overflow and connection details access.
8. Provider editor: edit inside the settings content pane; fields for name, API template, endpoint, optional key, model selection, fetching, filtering and manual IDs. Preserve bulk actions and raw mode. Never expose saved API keys. Use existing values from the app; screenshot endpoints/model names are sample/reference values, not verified service recommendations.
9. Settings/instructions: editable global instructions, count, save/clear and explanatory disclosure. Keep actual precedence behavior from the app.
10. Settings/web search: provider selection, endpoint, optional key, server-default status and reset/save. Show only provider-relevant fields. Retain existing backend behavior.
11. Settings/browser: enable toggle, independent connection status, version information, connection check, Chrome/Firefox packages, compact installation instructions and privacy/troubleshooting disclosures. Enabled must not imply connected. Preserve the underlying permissions and consent behavior.
12. Settings/preferences: show answer context toggle. Respect existing per-browser persistence and actual current state; do not add invented preferences.
13. Settings/users: searchable account list, role display, reset action, overflow and separate create form with name, email, initial password and role. Preserve authorization checks. Do not create or modify real accounts from mockup sample data.

BEHAVIOR AND QUALITY
- Treat screenshots as layouts, not a reason to remove functionality. Secondary controls may move into menus or tabs.
- Do not copy sample account addresses, credentials, endpoints or counts into production data. Use existing application state.
- Make buttons and forms functional. Include loading, validation, errors and empty states appropriate to existing flows.
- Modal accessibility: proper dialog semantics, labeled fields, focus trap, Escape behavior, return focus to opener and accessible tab navigation. Warn before discarding unsaved edits. Confirm destructive changes.
- Use visible keyboard focus and adequate text contrast. Respect reduced-motion preferences; keep transitions restrained.
- Responsive: at narrow widths use a compact navigation menu or bottom navigation, single-column cards, horizontally scrollable project tabs, wrapping composer controls and full-height forms with reachable actions. Avoid horizontal page overflow.
- Keep content and typography sharp, no bitmap screenshots as page backgrounds or substitutes for actual controls. Approximate decorative styling with CSS and icons.
- Validate the main workflows with existing checks, then visually compare the key screens at desktop and a narrow viewport. Fix clipping, alignment and overflow. Report the changed behavior, validation performed and any remaining mock-only interactions.
```
