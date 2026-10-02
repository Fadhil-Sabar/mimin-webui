# Mimin UI design pack

17 generated PNG mockups from this conversation: 13 current screens and 4 early explorations. This package contains visual concepts, not application source code.

## Start here
1. Open `index.html` locally to browse the mockups.
2. Use `screens/` for the current flat zinc direction. `explorations/` contains superseded alternatives.
3. Copy `prompts/MASTER-IMPLEMENTATION-PROMPT.md` into your coding agent with the current screenshots and repository.
4. For image variations, attach the matching PNG and use its paired Markdown prompt under `prompts/`.

## Prompt provenance
Per-image prompts are consolidated, reusable regeneration briefs based on the conversation, not verbatim original tool-call logs. The original shared settings prompt is also included as `prompts/SETTINGS-BASE-ORIGINAL.txt`. Regeneration is nondeterministic and may not reproduce the exact pixels.

## Scope and visual consistency
The current set includes home, projects, skills, chat, project detail, skill editor and seven settings views. Separate frosted-glass work from another conversation is not included. Do not interpret screenshot text as live configuration, working controls or actual changes to settings. Token values are suggested implementation targets. Some generated images vary in backdrop, spacing, status accents and icon rendering; the shared design brief takes precedence for implementation. Preserve complete app data and behaviors, including controls moved into tabs or menus.

## Files
- `screens/`: 13 current PNGs.
- `explorations/`: 4 earlier visual directions.
- `prompts/`: one reusable prompt per image, shared visual prompt, original settings base, master implementation prompt.
- `design-tokens.json`: proposed CSS design values.
- `manifest.json`: titles, prompt/image mapping, dimensions and SHA-256 checksums.
- `index.html`: offline visual index; no remote dependencies.
