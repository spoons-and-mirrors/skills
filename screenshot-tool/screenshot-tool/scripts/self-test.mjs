import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const screenshotScript = join(root, 'scripts', 'screenshot.mjs')

const baseEnv = {
  ...process.env,
  AUTO_INSTALL: '0',
  DRY_RUN: '1',
  JSON: '1',
  OUT_DIR: '/tmp/opencode/screenshot-tool-self-test',
}

await testDryRunJson()
await testEarlyValidation()

console.log('screenshot-tool self-test passed')

async function testDryRunJson() {
  const { stdout, stderr } = await execFileAsync(process.execPath, [screenshotScript, 'http://127.0.0.1:9/pricing?tab=pro'], {
    env: {
      ...baseEnv,
      FULL_PAGE: '1',
      HOVER_SELECTOR: '.pricing-card button',
      PRESS_KEY: 'Escape',
      WIDTHS: '390,768',
      HEIGHTS: '800,900',
    },
  })
  const result = JSON.parse(stdout)

  assert.equal(stderr, '')
  assert.equal(result.ok, true)
  assert.equal(result.dryRun, true)
  assert.equal(result.mode, 'full-page')
  assert.equal(result.planned.length, 2)
  assert.equal(result.planned[0].width, 390)
  assert.equal(result.planned[0].height, 800)
  assert.match(result.planned[0].file, /pricing-390xfull\.png$/)
}

async function testEarlyValidation() {
  await assert.rejects(
    execFileAsync(process.execPath, [screenshotScript, 'http://127.0.0.1:9/pricing'], {
      env: {
        ...baseEnv,
        WIDTHS: '390,768',
        HEIGHTS: '900',
      },
    }),
    /HEIGHTS must contain the same number of values as WIDTHS/,
  )
}
