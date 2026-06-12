import { access, mkdir, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireFromSkill = createRequire(path.join(skillRoot, 'package.json'))
let chromium

try {
  ;({ chromium } = requireFromSkill('@playwright/test'))
} catch (error) {
  throw new Error(
    'Cannot load @playwright/test. Run this skill\'s screenshot-install.mjs first to install dependencies in the loaded skill folder.',
    { cause: error },
  )
}

const args = process.argv.slice(2)
const baseUrl = process.env.BASE_URL
const rawTarget =
  args.find(
    (arg) =>
      arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('/'),
  ) ??
  process.env.URL

if (!rawTarget) {
  throw new Error(
    'No screenshot target provided. Pass a full URL, set URL, or pass a path with BASE_URL.',
  )
}

if (!rawTarget.startsWith('http') && !baseUrl) {
  throw new Error('Relative screenshot targets require BASE_URL, such as BASE_URL=http://host:port.')
}

const url = rawTarget.startsWith('http') ? rawTarget : new URL(rawTarget, baseUrl).href
const widths = args.filter((arg) => /^\d+$/.test(arg)).map(Number)
const viewportWidths = widths.length
  ? widths
  : (process.env.WIDTHS ?? '330,375,425,499,500,768')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
const height = Number(process.env.HEIGHT ?? 900)
const outDir = process.env.OUT_DIR ?? 'screenshots'
const fullPage = process.env.FULL_PAGE === 'true'
const locale = process.env.LOCALE ?? 'en-US'
const selector = process.env.SELECTOR
const fillSelector = process.env.FILL_SELECTOR
const fillText = process.env.FILL_TEXT ?? process.env.FILL_VALUE
const fillWait = Number(process.env.FILL_WAIT ?? 1000)
const defaultChromeArgs = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process',
]
const extraChromeArgs = (process.env.CHROME_ARGS ?? '')
  .split(/\s+/)
  .map((arg) => arg.trim())
  .filter(Boolean)
const waitUntil = process.env.WAIT_UNTIL ?? 'domcontentloaded'
const attempts = Number(process.env.ATTEMPTS ?? 10)
const blockFonts = process.env.BLOCK_FONTS === 'true'
const blockStyles = process.env.BLOCK_STYLES === 'true'
const sanitizeFonts = process.env.SANITIZE_FONTS === 'true'
const disableJavaScript = process.env.DISABLE_JAVASCRIPT === 'true'
const selectorMargin = 20
const scrollPositions = (process.env.SCROLLS ?? '0')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value >= 0)
const targetUrl = new URL(url)
const isLocalTarget = ['localhost', '127.0.0.1', '0.0.0.0'].includes(targetUrl.hostname)
const safePath = `${isLocalTarget ? '' : `${targetUrl.hostname}-`}${targetUrl.pathname}`
  .replace(/^\/$/, 'home')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-|-$/g, '')

async function executable(pathname) {
  if (!pathname) return null

  try {
    await access(pathname, constants.X_OK)
    return pathname
  } catch {
    return null
  }
}

async function downloadedChrome(root) {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    const matches = entries
      .filter((entry) => entry.isFile() && entry.name === 'chrome')
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((pathname) => pathname.includes('chrome-linux64'))
      .sort()

    for (const match of matches.reverse()) {
      const found = await executable(match)
      if (found) return found
    }
  } catch {
    return null
  }

  return null
}

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]

  for (const candidate of candidates) {
    const found = await executable(candidate)
    if (found) return found
  }

  return downloadedChrome('/tmp/opencode/browsers/chrome')
}

if (!viewportWidths.length) {
  throw new Error('No viewport widths provided')
}

if (!scrollPositions.length) {
  throw new Error('No scroll positions provided')
}

await mkdir(outDir, { recursive: true })

const executablePath = await chromePath()
if (!executablePath) {
  throw new Error(
    'No Chrome/Chromium executable found. Run screenshot-install or set CHROME_PATH.',
  )
}

const extraLibraryPath = '/tmp/opencode/browser-libs/usr/lib/x86_64-linux-gnu'
const extraFontConfigPath = '/tmp/opencode/browser-libs/etc/fonts'
const launchOptions = {
  executablePath,
  args: ['--no-sandbox', ...defaultChromeArgs, ...extraChromeArgs],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: [extraLibraryPath, process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(':'),
    FONTCONFIG_PATH: process.env.FONTCONFIG_PATH ?? extraFontConfigPath,
  },
}

function stripFontFaces(text) {
  return text.replace(/@font-face\s*{[^}]*}/gi, '')
}

async function capture({ sanitizeFontCss = false } = {}) {
  const browser = await chromium.launch(launchOptions)

  try {
    for (const width of viewportWidths) {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 1,
        locale,
        javaScriptEnabled: !disableJavaScript,
        extraHTTPHeaders: {
          'Accept-Language': `${locale},en;q=0.9`,
        },
      })

      if (blockFonts || blockStyles || sanitizeFontCss) {
        await page.route('**/*', async (route) => {
          const request = route.request()
          const resourceType = request.resourceType()
          const requestUrl = request.url()

          if (
            (blockStyles && resourceType === 'stylesheet') ||
            (blockFonts &&
              (resourceType === 'font' ||
                /\.(woff2?|ttf|otf)(\?.*)?$/i.test(requestUrl)))
          ) {
            route.abort()
            return
          }

          if (
            sanitizeFontCss &&
            (resourceType === 'document' || resourceType === 'stylesheet')
          ) {
            const response = await route.fetch()
            const headers = response.headers()
            const contentType = headers['content-type'] ?? ''

            if (/\b(html|css)\b/i.test(contentType)) {
              delete headers['content-length']
              await route.fulfill({
                status: response.status(),
                headers,
                body: stripFontFaces(await response.text()),
              })
              return
            }
          }

          route.continue()
        })
      }

      await page.goto(url, { waitUntil })
      await page.evaluate(() => document.fonts?.ready).catch(() => {})

      if (fillSelector) {
        if (fillText === undefined) {
          throw new Error('FILL_SELECTOR requires FILL_TEXT or FILL_VALUE')
        }

        const field = page.locator(fillSelector).first()
        await field.scrollIntoViewIfNeeded()
        await field.fill(fillText)
        await page.waitForTimeout(fillWait)
      }

      for (const scrollY of scrollPositions) {
        const scrollSuffix =
          scrollPositions.length > 1 || scrollY > 0 ? `-y${scrollY}` : ''
        const file = path.join(outDir, `${safePath}-${width}${scrollSuffix}.png`)

        await page.evaluate((nextScrollY) => window.scrollTo(0, nextScrollY), scrollY)
        await page.waitForTimeout(2000)

        if (selector) {
          const target = page.locator(selector).first()
          await target.scrollIntoViewIfNeeded()
          await page.waitForTimeout(2000)
          const box = await target.boundingBox()
          if (!box) {
            throw new Error(`Selector is not visible: ${selector}`)
          }

          await page.screenshot({
            path: file,
            clip: {
              x: Math.max(0, box.x - selectorMargin),
              y: Math.max(0, box.y - selectorMargin),
              width: box.width + selectorMargin * 2,
              height: box.height + selectorMargin * 2,
            },
          })
        } else {
          await page.screenshot({ path: file, fullPage })
        }

        console.log(`${width}px @ ${scrollY}px -> ${file}`)
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

let lastError

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await capture({ sanitizeFontCss: sanitizeFonts })
    lastError = undefined
    break
  } catch (error) {
    lastError = error

    if (attempt === attempts) break

    console.warn(`Screenshot attempt ${attempt} failed during page load; retrying...`)
  }
}

if (lastError) {
  throw lastError
}
