---
name: screenshot-tool
description: Capture reliable page and component screenshots with the repo Playwright screenshot scripts, including browser installation and selector-targeted screenshots. Use when the user asks for screenshots, visual verification, screenshot install, Playwright capture, fixed-scroll screenshots, or component-only screenshots.
---

# Screenshot Tool

## Quick Start

Run the app or preview server first, usually on `http://127.0.0.1:4173`.

```bash
pnpm screenshot -- / 768
```

Install Chrome and Linux browser libraries if Chrome is missing:

```bash
pnpm screenshot:install
```

## Common Workflows

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
