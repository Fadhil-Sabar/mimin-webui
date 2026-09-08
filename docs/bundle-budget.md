# Bundle budget

`npm run bundle:budget` inspects `build/client` after a production build. The checked limits are intentionally explicit and include all client assets:

| Asset group         | Maximum |
| ------------------- | ------: |
| JavaScript          | 4.5 MiB |
| CSS                 | 512 KiB |
| Total client assets |   7 MiB |

Pass a different build output directory as the first argument when validating a fixture. The command exits non-zero when any limit is exceeded or the directory is missing.
