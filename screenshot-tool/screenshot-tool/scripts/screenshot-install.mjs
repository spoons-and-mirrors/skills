import { access, mkdir, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawn } from 'node:child_process'

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
]

async function executable(name) {
  const paths = (process.env.PATH ?? '').split(delimiter).filter(Boolean)

  for (const base of paths) {
    const candidate = join(base, name)

    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // Keep searching PATH.
    }
  }

  return null
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

await mkdir(browserRoot, { recursive: true })
await run('pnpm', [
  'dlx',
  '@puppeteer/browsers',
  'install',
  'chrome@stable',
  '--path',
  browserRoot,
])

if (process.platform !== 'linux') {
  process.exit(0)
}

const aptGet = await executable('apt-get')
const dpkgDeb = await executable('dpkg-deb')

if (!aptGet || !dpkgDeb) {
  console.warn(
    'Skipping Linux browser library extraction: apt-get or dpkg-deb was not found.',
  )
  process.exit(0)
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
