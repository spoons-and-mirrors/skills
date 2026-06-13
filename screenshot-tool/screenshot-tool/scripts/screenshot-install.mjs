import { access, mkdir, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const browserRoot = '/tmp/opencode/browsers'
const debsDir = '/tmp/opencode/browser-lib-debs'
const libsDir = '/tmp/opencode/browser-libs'
const packages = [
  'libgtk-3-0t64',
  'libatk1.0-0t64',
  'libatk-bridge2.0-0t64',
  'libgbm1',
  'libasound2t64',
  'libcairo2',
  'libpango-1.0-0',
  'libxcomposite1',
  'libxdamage1',
  'libxfixes3',
  'libxrandr2',
  'libatspi2.0-0t64',
  'libcups2t64',
  'libavahi-common3',
  'libavahi-client3',
  'libavahi-common-data',
  'libfontconfig1',
  'libxrender1',
  'libxcb-render0',
  'libxcb-shm0',
  'libpixman-1-0',
  'libthai0',
  'libharfbuzz0b',
  'libxi6',
  'libxres1',
  'libdatrie1',
  'libgraphite2-3',
  'fontconfig',
  'fontconfig-config',
  'fonts-dejavu-core',
  'fonts-dejavu-mono',
  'fonts-liberation',
]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await mkdir(browserRoot, { recursive: true })

if (await systemChrome()) {
  console.log('System Chrome/Chromium found; skipping browser download.')
} else if (await downloadedChrome()) {
  console.log('Cached Chrome found; skipping browser download.')
} else {
  const pnpm = await executableFromPath('pnpm')
  const npx = await executableFromPath('npx')

  if (pnpm) {
    await run(pnpm, ['dlx', '@puppeteer/browsers', 'install', 'chrome@stable', '--path', browserRoot])
  } else if (npx) {
    await run(npx, ['--yes', '@puppeteer/browsers', 'install', 'chrome@stable', '--path', browserRoot])
  } else {
    throw new Error('Cannot install Chrome: pnpm or npx is required.')
  }
}

if (process.platform === 'linux') {
  await installLinuxLibraries()
}

if (await configuredCwebp()) {
  console.log('Configured cwebp found; skipping converter install.')
} else if (await packagedCwebp()) {
  console.log('Packaged cwebp found; skipping converter install.')
} else {
  await installNodeDependencies()
}

if (!(await cwebp())) {
  throw new Error('cwebp was not found after install. Run npm install in the skill directory or set CWEBP_PATH.')
}

async function installLinuxLibraries() {
  const aptGet = await executableFromPath('apt-get')
  const dpkgDeb = await executableFromPath('dpkg-deb')

  if (!aptGet || !dpkgDeb) {
    console.warn('Skipping Linux browser library extraction: apt-get or dpkg-deb was not found.')
    return
  }

  await mkdir(debsDir, { recursive: true })
  await mkdir(libsDir, { recursive: true })
  await run(aptGet, ['download', ...packages], { cwd: debsDir })

  const debs = (await readdir(debsDir))
    .filter((entry) => entry.endsWith('.deb'))
    .map((entry) => join(debsDir, entry))

  for (const deb of debs) {
    await run(dpkgDeb, ['-x', deb, libsDir])
  }
}

async function systemChrome() {
  return (
    (await executable(process.env.CHROME_PATH)) ||
    (await executable(process.env.CHROME_BIN)) ||
    (await executableFromPath('google-chrome')) ||
    (await executableFromPath('google-chrome-stable')) ||
    (await executableFromPath('chromium')) ||
    (await executableFromPath('chromium-browser'))
  )
}

async function cwebp() {
  return (await configuredCwebp()) || (await packagedCwebp())
}

async function configuredCwebp() {
  return (await executable(process.env.CWEBP_PATH)) || (await executable(process.env.CWEBP_BIN))
}

async function packagedCwebp() {
  return executable(join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'cwebp.cmd' : 'cwebp'))
}

async function installNodeDependencies() {
  const npm = await executableFromPath('npm')
  const pnpm = await executableFromPath('pnpm')

  if (npm) {
    await run(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root })
  } else if (pnpm) {
    await run(pnpm, ['install', '--prod'], { cwd: root })
  } else {
    throw new Error('Cannot install cwebp-bin: npm or pnpm is required.')
  }
}

async function downloadedChrome() {
  try {
    const entries = await readdir(join(browserRoot, 'chrome'), { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name === 'chrome' && entry.parentPath.includes('chrome-linux64')) {
        const found = await executable(join(entry.parentPath, entry.name))
        if (found) return found
      }
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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}
