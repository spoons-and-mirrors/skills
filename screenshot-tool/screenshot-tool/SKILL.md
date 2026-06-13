---
name: screenshot-tool
description: Capture reliable browser screenshots of an already-running URL with native Chrome. Use when the user asks for screenshots, visual verification, viewport captures, or page images; ask for the target URL when missing.
---

# Screenshot Tool

## Quick Start

Use this skill to screenshot an already-running website. Do not start the user's
dev server, inspect package scripts, or install app dependencies unless the user
explicitly asks for that.

If the user gave a URL, run the helper immediately from the directory where the
screenshots should be written:

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/path
```

If the URL is missing, ask one short question for the exact URL or base URL and
path. Do not guess the port or framework.

The helper uses native Chrome CLI by default, one Chrome process per viewport.
It hides Chrome stderr on success, keeps already-written PNGs when one viewport
fails, and auto-installs cached Chrome under `/tmp/opencode` only when no Chrome
or Chromium executable is found.

## Common Commands

Single viewport:

```bash
WIDTHS=768 HEIGHT=900 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Default responsive set:

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Custom output directory:

```bash
OUT_DIR=./pricing-screens WIDTHS=390,1440 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Relative target with a base URL:

```bash
BASE_URL=http://127.0.0.1:PORT node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs /pricing
```

Manual install or reinstall of Chrome/runtime libraries:

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot-install.mjs
```

## Defaults

- `WIDTHS=390,768,1440`
- `HEIGHT=900`
- `WAIT_MS=5000`
- `COMMAND_TIMEOUT_MS=30000` or `WAIT_MS + 15000`, whichever is higher
- `OUT_DIR=screenshots`
- `DEVICE_SCALE_FACTOR=1`
- `CONTINUE_ON_ERROR=1`

Output files are named from the route and viewport, such as
`screenshots/pricing-768x900.png`.

## Options

- `URL`: target URL when not passed as an argument.
- `BASE_URL`: required when passing a relative target such as `/pricing`.
- `WIDTHS`: comma-separated viewport widths.
- `HEIGHT`: viewport height for every width.
- `HEIGHTS`: comma-separated per-width heights; must match `WIDTHS` length.
- `WAIT_MS`: Chrome screenshot timeout in milliseconds.
- `COMMAND_TIMEOUT_MS`: wrapper watchdog timeout for each Chrome process.
- `OUT_DIR` or `OUTPUT_DIR`: output directory relative to the current directory.
- `CHROME_PATH` or `CHROME_BIN`: explicit Chrome/Chromium executable.
- `CHROME_ARGS`: extra Chrome flags, space-separated.
- `DEVICE_SCALE_FACTOR`: Chrome device scale factor.
- `HIDE_SCROLLBARS=true`: hide scrollbars in captures.
- `VIRTUAL_TIME_BUDGET`: pass Chrome's virtual-time budget for timer-heavy pages.
- `STRICT=1`: exit nonzero if any viewport fails.
- `AUTO_INSTALL=0`: do not auto-run the installer when Chrome is missing.

## Advanced Cases

The default path intentionally does not use Playwright. Use another browser
automation workflow only when the user specifically needs interaction or a
capability Chrome CLI does not provide, such as:

- selector/component-only screenshots
- full-scrollable-page screenshots
- clicking, typing, login, hover, or modal state
- waiting for a specific selector or app condition

Do not use Playwright, Puppeteer, Selenium, or ad-hoc `node -e` browser snippets
for normal viewport screenshots. The native Chrome helper is the reliable fast
path.

## Troubleshooting

- URL unreachable: check the exact URL with `curl -I --max-time 5 URL`.
- Chrome missing: run `screenshot-install.mjs` or set `CHROME_PATH`.
- Blank or early screenshot: rerun with a higher `WAIT_MS` or `VIRTUAL_TIME_BUDGET`.
- One viewport fails: keep the successful PNGs and retry only the failed width.
- Noisy font/HarfBuzz stderr on success: ignore it; the helper suppresses it.
