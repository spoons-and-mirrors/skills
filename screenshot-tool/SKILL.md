---
name: screenshot-tool
description: Capture reliable page and component screenshots with repo Playwright scripts. Use when the user asks for screenshots, visual verification, Playwright capture, or component-only screenshots.
---

# Screenshot Tool

## Quick Start

Run the app or preview server first, usually on `http://127.0.0.1:4173`.
Run screenshot commands from the application repo that defines the `screenshot`
script in `package.json`; do not run the skill's `scripts/screenshot.mjs`
directly from the skill cache or clone. The direct script import resolves
`@playwright/test` relative to the skill directory and can fail even when the app
repo has Playwright installed.

```bash
pnpm screenshot -- / 768
```

Install Chrome and Linux browser libraries if Chrome is missing, Chromium
crashes during `page.goto`, or the first capture fails with browser/library
errors:

```bash
pnpm screenshot:install
```

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
