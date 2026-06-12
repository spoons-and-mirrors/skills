---
name: screenshot-tool
description: Capture reliable page and component screenshots of an already-running URL. Use when the user asks for screenshots, visual verification, Playwright capture, or component-only screenshots; ask for the target URL when missing.
---

# Screenshot Tool

## Quick Start

This skill takes screenshots of an already-running website. It does not decide
how to run the user's app, and it should not start `pnpm preview`, `npm run dev`,
or any other server unless the user explicitly asks for that.

If the user does not provide the running URL, stop and ask one short question for
the URL or base URL and path. Do not assume a port, framework, package manager,
or preview command.

Do these steps in order:

1. Get the exact running URL from the user, such as `http://127.0.0.1:PORT/pricing`.
2. Open the app repo only if you need its installed Playwright dependency or its
   screenshot package script.
3. Install that repo's dependencies only if `node_modules/` is missing or the
   screenshot script cannot resolve packages. Use the repo's package manager from
   `packageManager` or the lockfile: `pnpm install`, `npm install`,
   `bun install`, or `yarn install`. Do not switch package managers just because
   one command failed; avoid creating a new lockfile in the repo.
4. Run the repo's `screenshot:install` script, or this skill's installer by
   absolute path, if Chrome is missing, Chromium crashes, or Linux browser
   libraries are missing.
5. Capture the explicit URL. If using a relative path, set `BASE_URL` explicitly.

Do not run ad-hoc Playwright snippets such as `node -e "import { chromium } ..."`
for normal screenshots. Those snippets bypass the helper's Chrome lookup,
`--no-sandbox`, and Linux `LD_LIBRARY_PATH` setup, which often causes missing
browser or missing `libatk`/GTK errors.

Example for a pnpm repo:

```bash
pnpm install
pnpm screenshot:install
BASE_URL=http://127.0.0.1:PORT pnpm screenshot -- /pricing 768
```

If the repo uses npm instead, use its matching scripts:

```bash
npm install
npm run screenshot:install
BASE_URL=http://127.0.0.1:PORT npm run screenshot -- /pricing 768
```

Fallback when the repo wrapper is missing but this skill is loaded:

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot-install.mjs
OUT_DIR=/tmp/screenshots WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Run that fallback from the application repo. The screenshot script loads
`@playwright/test` from the current app repo, not from the skill directory.

Install Chrome and Linux browser libraries if Chrome is missing, Chromium
crashes during `page.goto`, or the first capture fails with browser/library
errors. Use the same package manager as the repo:

```bash
pnpm screenshot:install
npm run screenshot:install
```

If `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@playwright/test'`
appears, you are either in the wrong directory or the app repo dependencies have
not been installed. Change to the app repo and run its install command first.

If a repo script fails with `Cannot find module .../.agents/skills/screenshot-tool`,
the local skill wrapper is missing. Do not edit unrelated app files just to take a
screenshot; run the loaded skill script by absolute path from the app repo.

If `page.goto` crashes, first test a simple route and a simple external URL with
the same helper. If those work, the target page is crashing the browser during
render; stop treating it as an install problem and inspect the page-specific CSS,
fonts, markup, or scripts.

```bash
OUT_DIR=/tmp/screenshots WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
OUT_DIR=/tmp/screenshots WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://example.com
```

When the user asks to use a temp directory, set `OUT_DIR` explicitly:

```bash
OUT_DIR=/tmp/screenshots WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

## Common Workflows

Check that the target route is reachable before debugging the screenshot tool:

```bash
curl -I --max-time 5 http://127.0.0.1:PORT/pricing
```

Viewport screenshot at the target URL:

```bash
WIDTHS=768 SCROLLS=1000 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
```

Screenshot multiple widths:

```bash
WIDTHS=330,375,768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
```

Screenshot multiple scroll positions:

```bash
WIDTHS=768 SCROLLS=900,1000,1100 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
```

Screenshot the full page:

```bash
FULL_PAGE=true WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
```

Screenshot a specific component or DOM node:

```bash
SELECTOR='[data-token-comparison-card]' WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
```

Fill an input, wait for UI updates, then screenshot the input or a containing
component:

```bash
FILL_SELECTOR='[data-provider-search-input]' FILL_TEXT='o' SELECTOR='[data-provider-search-input]' WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

If the repo wrapper is missing:

```bash
BASE_URL=http://127.0.0.1:PORT FILL_SELECTOR='[data-provider-search-input]' FILL_TEXT='o' SELECTOR='[data-provider-search-input]' WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs /pricing
```

## Selector Screenshots

Use selector screenshots when fixed-scroll viewport captures miss the target, animation timing makes the target hard to frame, or the user asks for a component screenshot.

Add a stable `data-*` attribute to the element when no good selector exists:

```astro
<div data-feature-card>
```

Then capture it:

```bash
SELECTOR='[data-feature-card]' WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
```

The script scrolls the selector into view, waits 2 seconds for animations to settle, and captures the element bounding box with a 20px margin on every side for breathing room.

## Interactive State

Use `FILL_SELECTOR` and `FILL_TEXT` when the requested screenshot depends on text
typed into an input, such as a search bar or filter field. Pair it with
`SELECTOR` to crop the final screenshot to the input or the component that should
show the filtered state.

The script fills the first matching `FILL_SELECTOR`, waits `FILL_WAIT` milliseconds
for the UI to update, then performs the normal viewport or selector screenshot.
Default `FILL_WAIT` is `1000`.

If the target page crashes before the fill happens, the input selector is not the
problem. Try diagnostic fallbacks such as `DISABLE_JAVASCRIPT=true`,
`BLOCK_FONTS=true`, or `BLOCK_STYLES=true`. Only use these to isolate the crash or
produce an emergency screenshot; they can change the rendered appearance.

If downloaded Chrome crashes on one page but not others, retry with the flags
that are most useful in constrained Linux environments:

```bash
WAIT_UNTIL=domcontentloaded CHROME_ARGS='--disable-dev-shm-usage --disable-gpu --single-process' node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

## Options

- `BASE_URL`: required when passing a relative target such as `/pricing`.
- `URL`: target URL if not passed as an argument.
- `WIDTHS`: comma-separated viewport widths, default `330,375,425,499,500,768`.
- `HEIGHT`: viewport height, default `900`.
- `SCROLLS`: comma-separated scroll positions, default `0`.
- `OUT_DIR`: output directory, default `screenshots`.
- `FULL_PAGE=true`: capture full-page viewport screenshots.
- `SELECTOR`: capture only the first matching DOM node, including a 20px margin around it.
- `FILL_SELECTOR`: fill the first matching input before capture.
- `FILL_TEXT` or `FILL_VALUE`: text to enter into `FILL_SELECTOR`.
- `FILL_WAIT`: milliseconds to wait after filling, default `1000`.
- `DISABLE_JAVASCRIPT=true`: disable page JavaScript for diagnostic captures.
- `BLOCK_FONTS=true`: block font requests for diagnostic captures.
- `BLOCK_STYLES=true`: block stylesheet requests for diagnostic captures.
- `CHROME_ARGS`: extra Chrome flags, space-separated.
- `WAIT_UNTIL`: Playwright `page.goto` wait mode, default `networkidle`; use
  `domcontentloaded` for pages that crash or never become idle.
- `LOCALE`: browser locale and `Accept-Language`, default `en-US`.
- `CHROME_PATH`: explicit Chrome/Chromium executable.

## Output

Screenshots are written to `screenshots/` by default. Filenames include the route, width, and scroll suffix when applicable, such as `home-768-y1000.png`.
