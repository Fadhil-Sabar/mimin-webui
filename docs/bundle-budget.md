# Bundle budget

`npm run bundle:budget` inspects `.svelte-kit/output/client` after a production build (or `build/client` when passed explicitly). The checked limits are explicit and include all client assets:

| Asset group                          | Maximum |
| ------------------------------------ | ------: |
| JavaScript                           | 4.5 MiB |
| CSS                                  | 512 KiB |
| Total client assets                  |   7 MiB |
| Any JavaScript chunk (raw)           | 680 KiB |
| Any JavaScript chunk (gzip, level 9) | 150 KiB |

The raw per-chunk limit is deliberately 680 KiB: Mermaid 11.17.2's `@mermaid-js/parser` produces a measured, indivisible 662096-byte minified chunk. Its measured gzip size is 141602 bytes, leaving small compression headroom without weakening the aggregate budgets. The build manifest check also requires Mermaid core to remain a dynamic entry and outside initial entry import graphs, preserving dynamic loading for chat startup.

Vite's `build.chunkSizeWarningLimit` is set to the same 680 KiB raw limit, so this documented Mermaid exception does not create a normal-build warning. The budget checker still fails independently on synthetic raw or gzip oversize chunks.

Pass a different build output directory as the first argument when validating a fixture. The command exits non-zero when any limit is exceeded, the directory is missing, or the Mermaid lazy-load invariant is absent.
