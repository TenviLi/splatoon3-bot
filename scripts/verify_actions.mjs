import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import { getPinnedBrowserVersion } from '../bot/screenshot/BrowserRuntime.mjs'

const execFileAsync = promisify(execFile)
const runnerImage = process.env.ACT_RUNNER_IMAGE || 'splatoon3-bot-act-runner:ubuntu-24.04'
const runnerPlatform = 'linux/amd64'
const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const browsersPackageJson = JSON.parse(
  await fs.readFile(new URL('../node_modules/@puppeteer/browsers/package.json', import.meta.url), 'utf8')
)
const [packageManager, pnpmVersion] = packageJson.packageManager.split('@')

if (packageManager !== 'pnpm' || !pnpmVersion) {
  throw new Error(`Expected an exact pnpm packageManager version, received: ${packageJson.packageManager}`)
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} failed with ${signal || `exit code ${code}`}`))
      }
    })
  })
}

const dockerHost = (
  await execFileAsync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
).stdout.trim()

if (!process.env.ACT_RUNNER_IMAGE) {
  await run('docker', [
    'build',
    '--platform',
    runnerPlatform,
    '--tag',
    runnerImage,
    '--build-arg',
    `PNPM_VERSION=${pnpmVersion}`,
    '--build-arg',
    `PUPPETEER_BROWSERS_VERSION=${browsersPackageJson.version}`,
    '--build-arg',
    `CHROME_VERSION=${getPinnedBrowserVersion()}`,
    '--file',
    '.github/act/Dockerfile',
    '.github/act',
  ])
}

const runnerPath = (
  await execFileAsync('docker', [
    'run',
    '--rm',
    '--platform',
    runnerPlatform,
    runnerImage,
    'printenv',
    'PATH',
  ])
).stdout.trim()

if (!runnerPath) {
  throw new Error(`Runner image does not declare PATH: ${runnerImage}`)
}

await run(
  'act',
  [
    'push',
    '--workflows',
    '.github/workflows/ci.yml',
    '--job',
    'verify',
    '--container-architecture',
    runnerPlatform,
    '--platform',
    `ubuntu-24.04=${runnerImage}`,
    '--pull=false',
    '--rm',
    '--env',
    'ACT=true',
    '--env',
    `PATH=${runnerPath}`,
  ],
  { ...process.env, DOCKER_HOST: dockerHost }
)
