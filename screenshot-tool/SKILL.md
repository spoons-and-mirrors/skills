---
name: screenshot-tool
description: Capture reliable page and component screenshots with repo Playwright scripts. Use when the user asks for screenshots, visual verification, Playwright capture, or component-only screenshots.
---

# Screenshot Tool

## Quick Start

Do these steps in order from the application repo, not from the skill directory:

1. Open the repo that owns the page and defines `screenshot` in `package.json`.
2. Install that repo's dependencies if `node_modules/` is missing or the screenshot
   script cannot resolve packages. Use the repo's package manager from
   `packageManager` or the lockfile: `pnpm install`, `npm install`,
   `bun install`, or `yarn install`. Do not switch package managers just because
   one command failed; avoid creating a new lockfile in the repo.
3. Run or verify the app/preview server, usually on `http://127.0.0.1:4173`.
4. Run the repo's `screenshot:install` script once if Chrome is missing,
   Chromium crashes, or Linux browser libraries are missing.
5. Capture with the repo's script.

Do not run the skill's `scripts/screenshot.mjs` directly from the skill cache or
clone. The direct script import resolves `@playwright/test` relative to the skill
directory and can fail even when the app repo has Playwright installed.

Example for a pnpm repo:

```bash
pnpm install
pnpm screenshot:install
pnpm screenshot -- / 768
```

If the repo uses npm instead, use its matching scripts:

```bash
npm install
npm run screenshot:install
npm run screenshot -- / 768
```

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

When the user asks to use a temp directory, set `OUT_DIR` explicitly:

```bash
OUT_DIR=/tmp/screenshots WIDTHS=768 pnpm screenshot -- /pricing
```

## Common Workflows

Check that the target route is reachable before debugging the screenshot tool:

```bash
curl -I --max-time 5 http://127.0.0.1:4173/pricing
```

Viewport screenshot at the default base URL:

```bash
WIDTHS=768 SCROLLS=1000 pnpm screenshot -- /
```

Screenshot multiple widths:

```bash
WIDTHS=330,375,768 pnpm screenshot -- /
```

Screenshot multiple scroll positions:

```bash
WIDTHS=768 SCROLLS=900,1000,1100 pnpm screenshot -- /
```

Screenshot the full page:

```bash
FULL_PAGE=true WIDTHS=768 pnpm screenshot -- /
```

Screenshot a specific component or DOM node:

```bash
SELECTOR='[data-token-comparison-card]' WIDTHS=768 pnpm screenshot -- /
```

## Selector Screenshots

Use selector screenshots when fixed-scroll viewport captures miss the target, animation timing makes the target hard to frame, or the user asks for a component screenshot.

Add a stable `data-*` attribute to the element when no good selector exists:

```astro
<div data-feature-card>
```

Then capture it:

```bash
SELECTOR='[data-feature-card]' WIDTHS=768 pnpm screenshot -- /
```

The script scrolls the selector into view, waits 2 seconds for animations to settle, and captures the element bounding box with a 20px margin on every side for breathing room.

## Options

- `BASE_URL`: base URL for relative targets, default `http://127.0.0.1:4173`.
- `URL`: target URL if not passed as an argument.
- `WIDTHS`: comma-separated viewport widths, default `330,375,425,499,500,768`.
- `HEIGHT`: viewport height, default `900`.
- `SCROLLS`: comma-separated scroll positions, default `0`.
- `OUT_DIR`: output directory, default `screenshots`.
- `FULL_PAGE=true`: capture full-page viewport screenshots.
- `SELECTOR`: capture only the first matching DOM node, including a 20px margin around it.
- `LOCALE`: browser locale and `Accept-Language`, default `en-US`.
- `CHROME_PATH`: explicit Chrome/Chromium executable.

## Output

Screenshots are written to `screenshots/` by default. Filenames include the route, width, and scroll suffix when applicable, such as `home-768-y1000.png`.
