import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

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
const widths = argWidths.length ? argWidths : parseNumbers(process.env.WIDTHS ?? '390,768,1440', 'WIDTHS')
const heights = parseNumbers(process.env.HEIGHTS ?? '', 'HEIGHTS')
const height = numberEnv('HEIGHT', 900)
const waitMs = numberEnv('WAIT_MS', numberEnv('TIMEOUT_MS', 5000))
const settleMs = numberEnv('SETTLE_MS', 1000, true)
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
const selector = process.env.SELECTOR ?? ''
const fullPage = boolEnv('FULL_PAGE')
const scrollPage = boolEnv('SCROLL_PAGE') || boolEnv('SCROLL')
const waitForSelector = process.env.WAIT_FOR_SELECTOR ?? ''
const waitForTimeoutMs = numberEnv('WAIT_FOR_TIMEOUT_MS', waitMs)
const padding = numberEnv('PADDING', numberEnv('COMPONENT_PADDING', 20), true)
const preClickSelector = process.env.PRE_CLICK_SELECTOR ?? ''
const clickSelector = process.env.CLICK_SELECTOR ?? ''
const focusSelector = process.env.FOCUS_SELECTOR ?? ''
const hoverSelector = process.env.HOVER_SELECTOR ?? ''
const typeSelector = process.env.TYPE_SELECTOR ?? process.env.FILL_SELECTOR ?? ''
const typeText = process.env.TYPE_TEXT ?? process.env.FILL_TEXT ?? ''
const pressKey = process.env.PRESS_KEY ?? ''
const actionWaitMs = numberEnv('ACTION_WAIT_MS', 500, true)
const jsonOutput = boolEnv('JSON') || boolEnv('SCREENSHOT_JSON')
const manifestFile = process.env.MANIFEST_FILE ?? (boolEnv('MANIFEST') ? join(outDir, 'manifest.json') : '')
const dryRun = boolEnv('DRY_RUN')
const imageFormat = 'webp'
const imageQuality = 80
const webpMethod = 6
const clearBeforeType =
  process.env.CLEAR_BEFORE_TYPE === undefined
    ? Boolean(process.env.FILL_SELECTOR)
    : boolEnv('CLEAR_BEFORE_TYPE')
const hasActions = Boolean(
  preClickSelector || clickSelector || focusSelector || hoverSelector || typeSelector || typeText || pressKey,
)
const cdpNeeded = Boolean(selector || fullPage || scrollPage || waitForSelector || hasActions)

if (typeText && !typeSelector && !focusSelector && !clickSelector) {
  throw new Error('TYPE_TEXT requires TYPE_SELECTOR, FOCUS_SELECTOR, or CLICK_SELECTOR.')
}

if (selector && fullPage) {
  throw new Error('Use SELECTOR or FULL_PAGE, not both.')
}

if (!widths.length) throw new Error('No viewport widths provided')
if (heights.length && heights.length !== widths.length) {
  throw new Error('HEIGHTS must contain the same number of values as WIDTHS')
}

const captures = widths.map((width, index) => {
  const viewportHeight = heights[index] ?? height
  return { width, height: viewportHeight, file: outputFile(width, viewportHeight) }
})
const successes = []
const failures = []

if (dryRun) {
  console.log(JSON.stringify(dryRunSummary(), null, 2))
  process.exit(0)
}

await mkdir(outDir, { recursive: true })
await ensureFontConfig()

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

let webpConverter = await webpConverterPath()
if (!webpConverter && autoInstall) {
  await runInstaller()
  chrome = (await chromePath()) ?? chrome
  webpConverter = await webpConverterPath()
}

if (!webpConverter) {
  throw new Error('No cwebp executable found. Run scripts/screenshot-install.mjs or set CWEBP_PATH.')
}

let installerRetried = false

for (const { width, height: viewportHeight, file } of captures) {
  try {
    await capture({ chrome, file, width, height: viewportHeight })
    successes.push(file)
    progress(`${width}x${viewportHeight} -> ${file}`)
  } catch (error) {
    if (autoInstall && !installerRetried && missingRuntimeLibrary(error)) {
      installerRetried = true
      await runInstaller()
      chrome = (await chromePath()) ?? chrome
      webpConverter = (await webpConverterPath()) ?? webpConverter

      try {
        await capture({ chrome, file, width, height: viewportHeight })
        successes.push(file)
        progress(`${width}x${viewportHeight} -> ${file}`)
        continue
      } catch (retryError) {
        error = retryError
      }
    }

    failures.push({ width, height: viewportHeight, file, error })
    console.error(`${width}x${viewportHeight} failed -> ${file}`)
    console.error(error.message)

    if (!continueOnError) break
  }
}

if (failures.length) {
  console.error(`Screenshot failures: ${failures.length}/${widths.length}`)
}

if (manifestFile) {
  await mkdir(dirname(manifestFile), { recursive: true })
  await writeFile(manifestFile, `${JSON.stringify(summary(), null, 2)}\n`)
}

if (jsonOutput) {
  console.log(JSON.stringify(summary(), null, 2))
}

if (!successes.length || (strict && failures.length)) {
  process.exitCode = 1
}

async function capture({ chrome, file, width, height }) {
  if (cdpNeeded) {
    await captureWithCdp({ chrome, file, width, height })
    return
  }

  await captureViewport({ chrome, file, width, height })
}

async function captureViewport({ chrome, file, width, height }) {
  const pngFile = temporaryPngFile(file)
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
    `--screenshot=${pngFile}`,
    ...(hideScrollbars ? ['--hide-scrollbars'] : []),
    ...(virtualTimeBudget > 0 ? [`--virtual-time-budget=${virtualTimeBudget}`] : []),
    ...extraChromeArgs,
    url,
  ]

  try {
    await runCommand(chrome, chromeArgs)
    await convertPngToWebp(pngFile, file)
  } finally {
    await rm(pngFile, { force: true })
  }
}

async function captureWithCdp({ chrome, file, width, height }) {
  const port = await openPort()
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
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${deviceScaleFactor}`,
    `--lang=${locale}`,
    ...(hideScrollbars ? ['--hide-scrollbars'] : []),
    ...extraChromeArgs,
    'about:blank',
  ]

  const child = spawn(chrome, chromeArgs, { env: chromeEnv() })
  let stderr = ''
  let captureDone = false
  const timeout = setTimeout(() => child.kill('SIGTERM'), commandTimeoutMs)

  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })

  const childExit = new Promise((resolvePromise, reject) => {
    child.on('exit', (code, signal) => {
      if (captureDone) resolvePromise()
      else reject(new Error(`Chrome exited before capture completed (${signal ?? code})`))
    })
    child.on('error', reject)
  })

  try {
    await Promise.race([captureWithOpenBrowser(), childExit])
  } catch (error) {
    const details = [error.message, stderr.trim() ? `stderr:\n${stderr.trim()}` : ''].filter(Boolean)
    throw new Error(details.join('\n\n'))
  } finally {
    captureDone = true
    clearTimeout(timeout)
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), 2000).unref()
  }

  async function captureWithOpenBrowser() {
    const page = await waitForPage(port)
    const cdp = await connectCdp(page.webSocketDebuggerUrl)

    try {
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor,
        mobile: false,
      })

      const loaded = cdp.waitFor('Page.loadEventFired', waitMs)
      const navigation = await cdp.send('Page.navigate', { url })
      if (navigation.errorText) {
        await loaded.catch(() => null)
        throw new Error(`Navigation failed: ${navigation.errorText}: ${url}`)
      }
      await loaded.catch(() => null)
      if (settleMs > 0) await sleep(settleMs)

      if (hideScrollbars) await hidePageScrollbars(cdp)
      if (waitForSelector) await waitForElement(cdp, waitForSelector, waitForTimeoutMs)
      if (hasActions) await performActions(cdp)
      if (scrollPage) await scrollThroughPage(cdp)

      const data = selector
        ? await captureSelector(cdp, selector)
        : fullPage
          ? await captureFullPage(cdp, width)
          : await captureViewportCdp(cdp)

      await writeWebp(data, file)
    } finally {
      await cdp.close()
    }
  }
}

async function captureViewportCdp(cdp) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })

  return data
}

async function captureFullPage(cdp, viewportWidth) {
  const { contentSize } = await cdp.send('Page.getLayoutMetrics')
  const clip = {
    x: 0,
    y: 0,
    width: Math.max(viewportWidth, Math.ceil(contentSize.width)),
    height: Math.ceil(contentSize.height),
    scale: 1,
  }
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip,
  })

  return data
}

async function waitForElement(cdp, cssSelector, timeoutMs) {
  const literal = JSON.stringify(cssSelector)
  const deadline = Date.now() + timeoutMs
  let lastError = 'not found'

  while (Date.now() < deadline) {
    const result = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const elements = [...document.querySelectorAll(${literal})];
        if (!elements.length) return { ok: false, error: 'not found' };
        for (const element of elements) {
          if (visibleRect(element)) return { ok: true };
        }
        return { ok: false, error: 'not visible' };

        function visibleRect(element) {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          if (rect.width <= 0 || rect.height <= 0) return null;
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return null;
          return rect;
        }
      })()`,
    })
    const value = result.result?.value

    if (value?.ok) return
    lastError = value?.error ?? lastError
    await sleep(100)
  }

  throw new Error(`WAIT_FOR_SELECTOR timed out after ${timeoutMs}ms (${lastError}): ${cssSelector}`)
}

async function captureSelector(cdp, cssSelector) {
  const literal = JSON.stringify(cssSelector)
  const result = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const elements = [...document.querySelectorAll(${literal})];
      if (!elements.length) return { error: 'No element matched SELECTOR' };
      for (const element of elements) {
        element.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = visibleRect(element);
        if (rect) {
          return {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
          };
        }
      }
      return { error: 'No visible element matched SELECTOR' };

      function visibleRect(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0) return null;
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return null;
        return rect;
      }
    })()`,
  })
  const rect = result.result?.value

  if (!rect || rect.error) throw new Error(`${rect?.error ?? 'Could not resolve SELECTOR'}: ${cssSelector}`)
  if (rect.width <= 0 || rect.height <= 0) throw new Error(`SELECTOR has no visible box: ${cssSelector}`)

  await sleep(250)
  const { contentSize } = await cdp.send('Page.getLayoutMetrics')
  const x = Math.max(0, Math.floor(rect.x - padding))
  const y = Math.max(0, Math.floor(rect.y - padding))
  const width = Math.min(Math.ceil(rect.width + padding * 2), Math.ceil(contentSize.width - x))
  const height = Math.min(Math.ceil(rect.height + padding * 2), Math.ceil(contentSize.height - y))
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x, y, width, height, scale: 1 },
  })

  return data
}

async function writeWebp(pngData, file) {
  const pngFile = temporaryPngFile(file)

  try {
    await writeFile(pngFile, pngData, 'base64')
    await convertPngToWebp(pngFile, file)
  } finally {
    await rm(pngFile, { force: true })
  }
}

async function performActions(cdp) {
  const targetForType = typeSelector || focusSelector || clickSelector
  const shouldTypeBeforeClick = Boolean(typeSelector || focusSelector)

  if (preClickSelector) {
    await clickElement(cdp, preClickSelector)
    if (actionWaitMs > 0) await sleep(actionWaitMs)
  }
  if (clickSelector && !shouldTypeBeforeClick) await clickElement(cdp, clickSelector)
  if (targetForType && (typeSelector || focusSelector || !clickSelector)) {
    await focusElement(cdp, targetForType)
  }

  if (clearBeforeType && targetForType) await clearElement(cdp, targetForType)
  if (typeText) await cdp.send('Input.insertText', { text: typeText })
  if (clickSelector && shouldTypeBeforeClick) await clickElement(cdp, clickSelector)
  if (pressKey) await pressKeyOnce(cdp, pressKey)
  if (hoverSelector) await hoverElement(cdp, hoverSelector)
  if (actionWaitMs > 0) await sleep(actionWaitMs)
}

async function clickElement(cdp, cssSelector) {
  const point = await hoverElement(cdp, cssSelector)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  })
}

async function hoverElement(cdp, cssSelector) {
  const point = await elementCenter(cdp, cssSelector)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
  })
  return point
}

async function pressKeyOnce(cdp, key) {
  const event = keyEvent(key)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

function keyEvent(key) {
  const aliases = {
    Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Esc: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
    Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  }

  return aliases[key] ?? {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    text: key.length === 1 ? key : undefined,
    unmodifiedText: key.length === 1 ? key : undefined,
    windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
  }
}

async function focusElement(cdp, cssSelector) {
  const literal = JSON.stringify(cssSelector)
  const result = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const element = document.querySelector(${literal});
      if (!element) return { error: 'No element matched selector' };
      element.scrollIntoView({ block: 'center', inline: 'center' });
      if (typeof element.focus !== 'function') return { error: 'Element is not focusable' };
      element.focus({ preventScroll: false });
      return { ok: true };
    })()`,
  })
  const value = result.result?.value
  if (!value || value.error) throw new Error(`${value?.error ?? 'Could not focus selector'}: ${cssSelector}`)
}

async function clearElement(cdp, cssSelector) {
  const literal = JSON.stringify(cssSelector)
  const result = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const element = document.querySelector(${literal});
      if (!element) return { error: 'No element matched selector' };
      if ('value' in element) element.value = '';
      else if (element.isContentEditable) element.textContent = '';
      else return { error: 'Element cannot be cleared' };
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`,
  })
  const value = result.result?.value
  if (!value || value.error) throw new Error(`${value?.error ?? 'Could not clear selector'}: ${cssSelector}`)
}

async function elementCenter(cdp, cssSelector) {
  const literal = JSON.stringify(cssSelector)
  const result = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const elements = [...document.querySelectorAll(${literal})];
      if (!elements.length) return { error: 'No element matched selector' };
      for (const element of elements) {
        element.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = visibleRect(element);
        if (rect) {
          return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          };
        }
      }
      return { error: 'No visible element matched selector' };

      function visibleRect(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0) return null;
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return null;
        return rect;
      }
    })()`,
  })
  const point = result.result?.value
  if (!point || point.error) throw new Error(`${point?.error ?? 'Could not resolve selector'}: ${cssSelector}`)
  return point
}

async function hidePageScrollbars(cdp) {
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const style = document.createElement('style');
      style.textContent = '::-webkit-scrollbar{display:none!important}html,body{scrollbar-width:none!important}';
      document.documentElement.appendChild(style);
    })()`,
  })
}

async function scrollThroughPage(cdp) {
  await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      let lastY = -1;
      const step = Math.max(window.innerHeight * 0.8, 400);
      const tick = () => {
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        if (window.scrollY >= maxY || window.scrollY === lastY) {
          window.scrollTo(0, 0);
          setTimeout(resolve, 250);
          return;
        }
        lastY = window.scrollY;
        window.scrollBy(0, step);
        setTimeout(tick, 150);
      };
      tick();
    })`,
  })
}

async function convertPngToWebp(inputFile, outputFile) {
  await runCommand(webpConverter, [
    '-quiet',
    '-m',
    String(webpMethod),
    '-q',
    String(imageQuality),
    '-mt',
    '-af',
    '-sharp_yuv',
    inputFile,
    '-o',
    outputFile,
  ])
}

function temporaryPngFile(file) {
  return `${file}.tmp.png`
}

function runCommand(command, args) {
  return new Promise((resolvePromise, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(command, args, { env: chromeEnv() })
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

async function openPort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolvePromise(address.port))
    })
  })
}

async function waitForPage(port) {
  const deadline = Date.now() + commandTimeoutMs
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const pages = await response.json()
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (page) return page
    } catch (error) {
      lastError = error
    }

    await sleep(100)
  }

  throw new Error(`Chrome DevTools did not start on port ${port}: ${lastError?.message ?? 'timeout'}`)
}

async function connectCdp(url) {
  const socket = new WebSocket(url)
  const pending = new Map()
  const waiters = new Map()
  let nextId = 1

  socket.addEventListener('message', handleMessage)
  socket.addEventListener('close', () => rejectAll(new Error('Chrome DevTools socket closed')))
  socket.addEventListener('error', () => rejectAll(new Error('Chrome DevTools socket error')))

  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  return { send, waitFor, close }

  function send(method, params = {}) {
    const id = nextId++
    const payload = JSON.stringify({ id, method, params })

    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} timed out after ${commandTimeoutMs}ms`))
      }, commandTimeoutMs)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolvePromise(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
      socket.send(payload)
    })
  }

  function waitFor(method, timeoutMs) {
    return new Promise((resolvePromise, reject) => {
      const waiter = (params) => {
        clearTimeout(timeout)
        resolvePromise(params)
      }
      const timeout = setTimeout(() => {
        removeWaiter(method, waiter)
        reject(new Error(`${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      addWaiter(method, waiter)
    })
  }

  function addWaiter(method, waiter) {
    const current = waiters.get(method) ?? []
    current.push(waiter)
    waiters.set(method, current)
  }

  function removeWaiter(method, waiterToRemove) {
    const current = waiters.get(method) ?? []
    waiters.set(
      method,
      current.filter((waiter) => waiter !== waiterToRemove),
    )
  }

  function handleMessage(event) {
    const message = JSON.parse(event.data)

    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return

      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result ?? {})
      return
    }

    const current = waiters.get(message.method) ?? []
    waiters.delete(message.method)
    for (const waiter of current) waiter(message.params ?? {})
  }

  function rejectAll(error) {
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }

  function close() {
    socket.close()
  }
}

async function runInstaller() {
  const installer = resolve(dirname(fileURLToPath(import.meta.url)), 'screenshot-install.mjs')
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [installer], {
      stdio: jsonOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })

    if (jsonOutput) {
      child.stdout?.pipe(process.stderr)
      child.stderr?.pipe(process.stderr)
    }

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`screenshot-install.mjs exited with ${code}`))
    })
  })
}

async function webpConverterPath() {
  return (
    (await executable(process.env.CWEBP_PATH)) ||
    (await executable(process.env.CWEBP_BIN)) ||
    (await executable(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', process.platform === 'win32' ? 'cwebp.cmd' : 'cwebp')))
  )
}

async function ensureFontConfig() {
  const fontRoot = '/tmp/opencode/browser-libs/usr/share/fonts'
  const configDir = '/tmp/opencode/browser-libs/etc/fonts'
  const cacheDir = '/tmp/opencode/font-cache'
  const configFile = '/tmp/opencode/browser-libs/opencode-fonts.conf'

  try {
    await access(fontRoot, constants.R_OK)
  } catch {
    return
  }

  await mkdir(cacheDir, { recursive: true })
  await writeFile(
    configFile,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fontRoot}</dir>
  <cachedir>${cacheDir}</cachedir>
  <include ignore_missing="yes">${configDir}/conf.d</include>
</fontconfig>
`,
  )
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
  const extraFontConfigFile = '/tmp/opencode/browser-libs/opencode-fonts.conf'

  return {
    ...process.env,
    LD_LIBRARY_PATH: [extraLibraryPath, process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(':'),
    FONTCONFIG_FILE: process.env.FONTCONFIG_FILE ?? extraFontConfigFile,
    FONTCONFIG_PATH: process.env.FONTCONFIG_PATH ?? extraFontConfigPath,
  }
}

function parseNumbers(value, name) {
  const raw = value.trim()
  if (!raw) return []

  return raw.split(',').map((entry) => {
    const trimmed = entry.trim()
    const parsed = Number(trimmed)
    if (!trimmed || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a comma-separated list of positive integers; invalid value: ${trimmed || '(empty)'}`)
    }

    return parsed
  })
}

function numberEnv(name, fallback, allowZero = false) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback

  const value = Number(raw)
  if (Number.isFinite(value) && (value > 0 || (allowZero && value === 0))) return value

  throw new Error(`${name} must be ${allowZero ? 'zero or a positive number' : 'a positive number'}; invalid value: ${raw}`)
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

function outputFile(width, height) {
  if (selector) return join(outDir, `${safeName(targetUrl)}-component-${width}x${height}.${imageFormat}`)
  if (fullPage) return join(outDir, `${safeName(targetUrl)}-${width}xfull.${imageFormat}`)
  return join(outDir, `${safeName(targetUrl)}-${width}x${height}.${imageFormat}`)
}

function summary(extra = {}) {
  const failureByFile = new Map(failures.map((failure) => [failure.file, failure]))
  const successFiles = new Set(successes)

  return {
    ok: successes.length > 0 && !(strict && failures.length),
    url,
    mode: captureMode(),
    format: imageFormat,
    quality: imageQuality,
    outDir,
    captures: captures.map((capture) => {
      const failure = failureByFile.get(capture.file)

      return {
        ...capture,
        ok: successFiles.has(capture.file),
        ...(failure ? { error: failure.error.message } : {}),
      }
    }),
    files: successes,
    failures: failures.map((failure) => ({
      width: failure.width,
      height: failure.height,
      file: failure.file,
      error: failure.error.message,
    })),
    ...extra,
  }
}

function dryRunSummary() {
  return {
    ok: true,
    dryRun: true,
    url,
    mode: captureMode(),
    format: imageFormat,
    quality: imageQuality,
    outDir,
    captures: captures.map((capture) => ({ ...capture, ok: true, planned: true })),
    planned: captures,
    files: [],
    failures: [],
  }
}

function captureMode() {
  if (selector) return 'selector'
  if (fullPage && scrollPage) return 'full-page-scroll'
  if (fullPage) return 'full-page'
  if (cdpNeeded) return 'viewport-cdp'
  return 'viewport'
}

function progress(message) {
  if (jsonOutput) console.error(message)
  else console.log(message)
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function missingRuntimeLibrary(error) {
  return /error while loading shared libraries|cannot open shared object file/i.test(error?.message ?? '')
}

function safeName(parsedUrl) {
  const isLocalTarget = ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsedUrl.hostname)
  const route = parsedUrl.pathname === '/' ? 'home' : parsedUrl.pathname
  const search = parsedUrl.search ? `query-${parsedUrl.search.slice(1)}` : ''
  const hash = parsedUrl.hash ? `hash-${parsedUrl.hash.slice(1)}` : ''
  const target = [route, search, hash].filter(Boolean).join('-')
  const name = `${isLocalTarget ? '' : `${parsedUrl.hostname}-`}${target}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')

  return name || 'screenshot'
}
