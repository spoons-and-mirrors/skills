---
name: screenshot-tool
description: Capture reliable browser screenshots of an already-running URL with native Chrome. Use when the user asks for screenshots, visual verification, viewport captures, or page images; ask for the target URL when missing.
---

# Screenshot Tool

## Quick Start

Use this skill to screenshot an already-running website. Do not start the user's
dev server, inspect package scripts, or install app dependencies unless the user
explicitly asks for that.

Optimize for the fewest tool calls. If the user provides a full URL, run exactly
one screenshot command first. Do not preflight with `curl`, do not run the
installer, and do not inspect the app repo before capturing. Only investigate or
install after the screenshot command fails.

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
or Chromium executable is found. It also retries once after installing runtime
libraries when Chrome fails because a shared browser library is missing. CDP
modes wait `SETTLE_MS=1000` after page load before acting or capturing, so common
initial animations and hydration have a chance to settle.

After a successful capture, report the generated file path. If the user asks to
inspect the screenshot content, read the PNG that was just generated; do not
take another screenshot unless they ask for another viewport or route.

Choose the capture mode from the user's words:

- Plain screenshot, viewport screenshot, responsive screenshot: use the default command.
- Full page, whole page, entire page: add `FULL_PAGE=1`.
- Full page with scrolling or lazy-loaded content: add `FULL_PAGE=1 SCROLL_PAGE=1`.
- Component, section, element, card, header, modal, specific thing: add `SELECTOR='css selector'` and use `PADDING=20` unless the user requests another padding.
- Click/focus/type then screenshot: add `CLICK_SELECTOR`, `FOCUS_SELECTOR`, `TYPE_SELECTOR`, and/or `TYPE_TEXT` to the same helper command.

Do not use a second browser automation snippet for full-page, selector, click,
focus, or type shots. The helper supports those modes directly.

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

Full page at one width:

```bash
FULL_PAGE=1 WIDTHS=1440 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Full page after scrolling through lazy-loaded content:

```bash
FULL_PAGE=1 SCROLL_PAGE=1 WIDTHS=1440 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Specific component with 20px visual padding:

```bash
SELECTOR='.pricing-card' PADDING=20 WIDTHS=1440 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Click an element, then screenshot the resulting state:

```bash
CLICK_SELECTOR='button[aria-label="Open menu"]' WIDTHS=1440 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Focus an element, type text, then screenshot the result:

```bash
TYPE_SELECTOR='input[name="email"]' TYPE_TEXT='test@example.com' WIDTHS=1440 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/signup
```

Fill an input by clearing it first, then screenshot a specific component:

```bash
FILL_SELECTOR='input[type="search"]' FILL_TEXT='enterprise' SELECTOR='.search-results' PADDING=20 WIDTHS=1440 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/search
```

Relative target with a base URL:

```bash
BASE_URL=http://127.0.0.1:PORT node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs /pricing
```

Manual install or reinstall of Chrome/runtime libraries, only after the
screenshot command reports a missing-browser or missing-library failure:

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot-install.mjs
```

## Defaults

- `WIDTHS=390,768,1440`
- `HEIGHT=900`
- `WAIT_MS=5000`
- `SETTLE_MS=1000` for CDP modes: full-page, selector, click, focus, and type
- `COMMAND_TIMEOUT_MS=30000` or `WAIT_MS + 15000`, whichever is higher
- `OUT_DIR=screenshots`
- `DEVICE_SCALE_FACTOR=1`
- `CONTINUE_ON_ERROR=1`
- `PADDING=20` for `SELECTOR` captures

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
- `FULL_PAGE=1`: capture the full document height instead of only the viewport.
- `SCROLL_PAGE=1` or `SCROLL=1`: scroll through the page before capture to trigger lazy-loaded content.
- `SELECTOR`: CSS selector for a component/element screenshot.
- `PADDING` or `COMPONENT_PADDING`: pixels of visual padding around `SELECTOR`, default `20`.
- `CLICK_SELECTOR`: CSS selector to click before capture.
- `FOCUS_SELECTOR`: CSS selector to focus before capture.
- `TYPE_SELECTOR`: CSS selector to focus before inserting `TYPE_TEXT`.
- `TYPE_TEXT`: text to insert after click/focus/type targeting. Requires `TYPE_SELECTOR`, `FOCUS_SELECTOR`, or `CLICK_SELECTOR`.
- `FILL_SELECTOR` and `FILL_TEXT`: aliases for `TYPE_SELECTOR` and `TYPE_TEXT` that clear the target before typing.
- `CLEAR_BEFORE_TYPE=1`: clear the typed-into element before inserting `TYPE_TEXT`.
- `ACTION_WAIT_MS`: wait after click/focus/type actions before capture, default `500`.
- `STRICT=1`: exit nonzero if any viewport fails.
- `AUTO_INSTALL=0`: do not auto-run the installer when Chrome is missing.

## Advanced Cases

The helper intentionally does not use Playwright. It already supports viewport,
full-page, lazy-scroll full-page, padded selector screenshots, and simple
click/focus/type state setup. Use another browser automation workflow only when
the user specifically needs unsupported interaction, such as:

- login flows with multiple pages or authentication state
- hover-only state
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
