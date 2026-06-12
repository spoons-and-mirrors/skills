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

Default process:

1. Get the exact running URL from the user, such as `http://127.0.0.1:PORT/pricing`.
2. Run this skill's installer before the first capture attempt. Do not wait for a
   missing-Playwright or missing-Chrome error. The installer is idempotent and
   installs Node dependencies into the loaded skill folder itself.
3. Capture the explicit URL with this skill's helper from the same loaded skill folder.
   Run it from the directory where the user should find the output. By default,
   screenshots are written to `./screenshots` relative to the agent's current
   working directory. Do not use `/tmp` unless the user explicitly asks for a temp
   directory.

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot-install.mjs
WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

The installer creates `node_modules/` in the loaded skill folder and a
Chrome/runtime-library cache under `/tmp/opencode`. Do not add dependencies to
the user's project just to take a screenshot of an already-running URL.

Do not inspect the app repo's `package.json`, run app package scripts, or install
app dependencies just to screenshot an already-running URL. Only inspect app
source when you need app-specific selectors or markup.

Do not run ad-hoc Playwright snippets such as `node -e "import { chromium } ..."`
or transient Puppeteer commands such as `npm exec --package puppeteer-core` for
normal screenshots. Those snippets bypass the helper's Chrome lookup,
`--no-sandbox`, Linux `LD_LIBRARY_PATH`, font configuration, fill/selector
support, and crash workarounds.

When this skill is loaded, every screenshot workflow starts with the installer
command. Run it even when you expect dependencies to already exist, unless you
successfully ran it earlier in the same assistant turn from the same loaded skill
folder.

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot-install.mjs
WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

Run that fallback from the workspace or directory where the user should find the
output. The screenshot script loads `@playwright/test` from the loaded skill
folder first.

The installer handles the skill-folder Playwright dependency, Chrome, and Linux
browser libraries. Treat browser/library errors after that as installation
diagnostics, not as the normal install trigger:

```bash
node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot-install.mjs
```

If `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@playwright/test'`
appears, run this skill's `screenshot-install.mjs` from the same loaded skill
folder, then rerun `screenshot.mjs`. Do not switch to the Playwright CLI, do not
run transient Puppeteer commands, and do not install packages in the user's app
repo just for a screenshot.

If a repo script fails with `Cannot find module .../.agents/skills/screenshot-tool`,
the local skill wrapper is missing. Do not edit unrelated app files just to take a
screenshot; run the loaded skill script by absolute path from the app repo.

If `page.goto` crashes, first test a simple route and a simple external URL with
the same helper. If those work, the target page is crashing the browser during
render; stop treating it as an install problem and inspect the page-specific CSS,
fonts, markup, or scripts.

Transient retry messages such as `Screenshot attempt 1 failed during page load;
retrying...` mean Chrome closed while rendering the page. The helper retries
because some local pages are flaky in downloaded Chrome on constrained Linux,
especially around complex text/font rendering. The screenshot is valid if a later
attempt saves the file; the full error is only useful when all attempts fail.

```bash
WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/
WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://example.com
```

When the user asks for a specific output directory, set `OUT_DIR` explicitly. Use
cwd-relative directories by default, and use `/tmp/...` only when the user asks for
a temp directory:

```bash
OUT_DIR=./pricing-screenshot WIDTHS=768 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
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
`SANITIZE_FONTS=true`, `BLOCK_FONTS=true`, or `BLOCK_STYLES=true`. Only use these
to isolate the crash or produce an emergency screenshot; they can change the
rendered appearance.

The helper already launches Chrome with the constrained-Linux defaults that have
been most reliable here: `--disable-dev-shm-usage`, `--disable-gpu`,
`--single-process`, `WAIT_UNTIL=domcontentloaded`, and `ATTEMPTS=10`. If a page
still flakes, raise `ATTEMPTS` rather than switching tools:

```bash
ATTEMPTS=3 node ~/.cache/opencode/skills/screenshot-tool/scripts/screenshot.mjs http://127.0.0.1:PORT/pricing
```

## Options

- `BASE_URL`: required when passing a relative target such as `/pricing`.
- `URL`: target URL if not passed as an argument.
- `WIDTHS`: comma-separated viewport widths, default `330,375,425,499,500,768`.
- `HEIGHT`: viewport height, default `900`.
- `SCROLLS`: comma-separated scroll positions, default `0`.
- `OUT_DIR`: output directory, default `screenshots` relative to the current working directory. Prefer cwd-relative output so the user can find it; use `/tmp/...` only when requested.
- `FULL_PAGE=true`: capture full-page viewport screenshots.
- `SELECTOR`: capture only the first matching DOM node, including a 20px margin around it.
- `FILL_SELECTOR`: fill the first matching input before capture.
- `FILL_TEXT` or `FILL_VALUE`: text to enter into `FILL_SELECTOR`.
- `FILL_WAIT`: milliseconds to wait after filling, default `1000`.
- `DISABLE_JAVASCRIPT=true`: disable page JavaScript for diagnostic captures.
- `SANITIZE_FONTS=true`: strip `@font-face` rules from HTML/CSS before Chrome
  parses them for diagnostic captures.
- `BLOCK_FONTS=true`: block font requests for diagnostic captures.
- `BLOCK_STYLES=true`: block stylesheet requests for diagnostic captures.
- `CHROME_ARGS`: extra Chrome flags, space-separated. The helper already uses
  `--disable-dev-shm-usage`, `--disable-gpu`, and `--single-process`.
- `WAIT_UNTIL`: Playwright `page.goto` wait mode, default `domcontentloaded`.
- `ATTEMPTS`: capture retry count for browser-process crashes, default `10`.
- `LOCALE`: browser locale and `Accept-Language`, default `en-US`.
- `CHROME_PATH`: explicit Chrome/Chromium executable.

## Output

Screenshots are written to `screenshots/` in the current working directory by default. Filenames include the route, width, and scroll suffix when applicable, such as `home-768-y1000.png`.
