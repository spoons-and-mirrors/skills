import { access, mkdir, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const baseUrl = process.env.BASE_URL
const rawTarget =
  args.find(
    (arg) =>
      arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('/'),
  ) ?? process.env.URL

if (!rawTarget) {
  throw new Error('No screenshot target provided. Pass a full URL, set URL, or pass a path with BASE_URL.')
}

if (!rawTarget.startsWith('http') && !baseUrl) {
  throw new Error('Relative screenshot targets require BASE_URL, such as BASE_URL=http://host:port.')
}

const url = rawTarget.startsWith('http') ? rawTarget : new URL(rawTarget, baseUrl).href
const targetUrl = new URL(url)
const argWidths = args.filter((arg) => /^\d+$/.test(arg)).map(Number)
const widths = argWidths.length ? argWidths : parseNumbers(process.env.WIDTHS ?? '390,768,1440')
const heights = parseNumbers(process.env.HEIGHTS ?? '')
const height = numberEnv('HEIGHT', 900)
const waitMs = numberEnv('WAIT_MS', numberEnv('TIMEOUT_MS', 5000))
const commandTimeoutMs = numberEnv('COMMAND_TIMEOUT_MS', Math.max(waitMs + 15000, 30000))
const deviceScaleFactor = numberEnv('DEVICE_SCALE_FACTOR', 1)
const outDir = process.env.OUT_DIR ?? process.env.OUTPUT_DIR ?? 'screenshots'
const locale = process.env.LOCALE ?? 'en-US'
const strict = boolEnv('STRICT')
const continueOnError = process.env.CONTINUE_ON_ERROR === undefined || boolEnv('CONTINUE_ON_ERROR')
const autoInstall = process.env.AUTO_INSTALL !== '0' && process.env.AUTO_INSTALL !== 'false'
const hideScrollbars = boolEnv('HIDE_SCROLLBARS')
const virtualTimeBudget = numberEnv('VIRTUAL_TIME_BUDGET', 0)
const extraChromeArgs = splitArgs(process.env.CHROME_ARGS ?? '')
const unsupportedAdvancedOptions = [
  ['SELECTOR', process.env.SELECTOR],
  ['FILL_SELECTOR', process.env.FILL_SELECTOR],
  ['FULL_PAGE', process.env.FULL_PAGE === 'true' ? 'true' : ''],
].filter(([, value]) => value)

if (unsupportedAdvancedOptions.length) {
  const names = unsupportedAdvancedOptions.map(([name]) => name).join(', ')
  throw new Error(
    `${names} requires advanced browser automation. The default screenshot path uses Chrome CLI for viewport screenshots only.`,
  )
}

if (!widths.length) throw new Error('No viewport widths provided')
if (heights.length && heights.length !== widths.length) {
  throw new Error('HEIGHTS must contain the same number of values as WIDTHS')
}

await mkdir(outDir, { recursive: true })

let chrome = await chromePath()
if (!chrome && autoInstall) {
  await runInstaller()
  chrome = await chromePath()
}

if (!chrome) {
  throw new Error(
    'No Chrome/Chromium executable found. Install Chrome/Chromium, set CHROME_PATH, or run scripts/screenshot-install.mjs.',
  )
}

const successes = []
const failures = []

for (const [index, width] of widths.entries()) {
  const viewportHeight = heights[index] ?? height
  const file = join(outDir, `${safeName(targetUrl)}-${width}x${viewportHeight}.png`)

  try {
    await captureViewport({ chrome, file, width, height: viewportHeight })
    successes.push(file)
    console.log(`${width}x${viewportHeight} -> ${file}`)
  } catch (error) {
    failures.push({ width, height: viewportHeight, file, error })
    console.error(`${width}x${viewportHeight} failed -> ${file}`)
    console.error(error.message)

    if (!continueOnError) break
  }
}

if (failures.length) {
  console.error(`Screenshot failures: ${failures.length}/${widths.length}`)
}

if (!successes.length || (strict && failures.length)) {
  process.exitCode = 1
}

async function captureViewport({ chrome, file, width, height }) {
  const chromeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${deviceScaleFactor}`,
    `--lang=${locale}`,
    `--timeout=${waitMs}`,
    `--screenshot=${file}`,
    ...(hideScrollbars ? ['--hide-scrollbars'] : []),
    ...(virtualTimeBudget > 0 ? [`--virtual-time-budget=${virtualTimeBudget}`] : []),
    ...extraChromeArgs,
    url,
  ]

  await runChrome(chrome, chromeArgs)
}

function runChrome(command, chromeArgs) {
  return new Promise((resolvePromise, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(command, chromeArgs, { env: chromeEnv() })
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }, commandTimeoutMs)
    timeout.unref()

    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)

      if (timedOut) {
        reject(new Error(`${command} timed out after ${commandTimeoutMs}ms`))
        return
      }

      if (code === 0) {
        resolvePromise()
        return
      }

      const details = [
        `${command} exited with ${code}`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : '',
        stderr.trim() ? `stderr:\n${stderr.trim()}` : '',
      ].filter(Boolean)
      reject(new Error(details.join('\n\n')))
    })
  })
}

async function runInstaller() {
  const installer = resolve(dirname(fileURLToPath(import.meta.url)), 'screenshot-install.mjs')
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [installer], { stdio: 'inherit' })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`screenshot-install.mjs exited with ${code}`))
    })
  })
}

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    await executableFromPath('google-chrome'),
    await executableFromPath('google-chrome-stable'),
    await executableFromPath('chromium'),
    await executableFromPath('chromium-browser'),
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

async function downloadedChrome(root) {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    const matches = entries
      .filter((entry) => entry.isFile() && entry.name === 'chrome')
      .map((entry) => join(entry.parentPath, entry.name))
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

async function executableFromPath(name) {
  const paths = (process.env.PATH ?? '').split(delimiter).filter(Boolean)

  for (const base of paths) {
    const found = await executable(join(base, name))
    if (found) return found
  }

  return null
}

async function executable(pathname) {
  if (!pathname) return null

  try {
    await access(pathname, constants.X_OK)
    return pathname
  } catch {
    return null
  }
}

function chromeEnv() {
  const extraLibraryPath = '/tmp/opencode/browser-libs/usr/lib/x86_64-linux-gnu'
  const extraFontConfigPath = '/tmp/opencode/browser-libs/etc/fonts'

  return {
    ...process.env,
    LD_LIBRARY_PATH: [extraLibraryPath, process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(':'),
    FONTCONFIG_PATH: process.env.FONTCONFIG_PATH ?? extraFontConfigPath,
  }
}

function parseNumbers(value) {
  return value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry > 0)
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function boolEnv(name) {
  return process.env[name] === '1' || process.env[name] === 'true'
}

function splitArgs(value) {
  return value
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function safeName(parsedUrl) {
  const isLocalTarget = ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsedUrl.hostname)
  const route = parsedUrl.pathname === '/' ? 'home' : parsedUrl.pathname
  const name = `${isLocalTarget ? '' : `${parsedUrl.hostname}-`}${route}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')

  return name || 'screenshot'
}
