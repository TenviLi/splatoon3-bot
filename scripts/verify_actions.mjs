import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getPinnedBrowserVersion } from '../bot/screenshot/BrowserRuntime.mjs'

const execFileAsync = promisify(execFile)
const runnerImage = process.env.ACT_RUNNER_IMAGE || 'splatoon3-bot-act-runner:ubuntu-24.04'
const gitleaksImage = 'splatoon3-bot-gitleaks:local'
const runnerPlatform = 'linux/amd64'
const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const browsersPackageJson = JSON.parse(
  await fs.readFile(new URL('../node_modules/@puppeteer/browsers/package.json', import.meta.url), 'utf8')
)
const [packageManager, pnpmVersion] = packageJson.packageManager.split('@')

if (packageManager !== 'pnpm' || !pnpmVersion) {
  throw new Error(`Expected an exact pnpm packageManager version, received: ${packageJson.packageManager}`)
}

function normalizeHttpsUrl(value, label) {
  let url
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error(`${label} must be an absolute HTTPS URL: ${value}`, { cause: error })
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS URL without credentials, a query, or a fragment`)
  }
  return url.toString().replace(/\/$/, '')
}

function containerProxyUrl(value, label) {
  let url
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error(`${label} must be an absolute HTTP(S) URL`, { cause: error })
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be an HTTP(S) URL without credentials, a query, or a fragment`)
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    url.hostname = 'host.docker.internal'
  }
  return url.toString().replace(/\/$/, '')
}

const hostRegistry = (
  await execFileAsync(packageManager, ['config', 'get', 'registry'])
).stdout.trim()
const actNpmRegistry = normalizeHttpsUrl(
  process.env.ACT_NPM_REGISTRY ||
    (!hostRegistry || hostRegistry === 'undefined' ? 'https://registry.npmjs.org' : hostRegistry),
  'ACT_NPM_REGISTRY'
)
const registryHostname = new URL(actNpmRegistry).hostname
const defaultChromeDownloadBaseUrl =
  registryHostname === 'registry.npmmirror.com' || registryHostname.endsWith('.npmmirror.com')
    ? 'https://cdn.npmmirror.com/binaries/chrome-for-testing'
    : ''
const actChromeDownloadBaseUrl = process.env.ACT_CHROME_DOWNLOAD_BASE_URL
  ? normalizeHttpsUrl(process.env.ACT_CHROME_DOWNLOAD_BASE_URL, 'ACT_CHROME_DOWNLOAD_BASE_URL')
  : defaultChromeDownloadBaseUrl
const actNetworkConcurrency = process.env.ACT_NETWORK_CONCURRENCY || '8'
if (!/^[1-9]\d*$/.test(actNetworkConcurrency)) {
  throw new Error(`ACT_NETWORK_CONCURRENCY must be a positive integer: ${actNetworkConcurrency}`)
}
const hostHttpProxy = process.env.HTTP_PROXY || process.env.http_proxy
const hostHttpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || hostHttpProxy
const containerHttpProxy = hostHttpProxy ? containerProxyUrl(hostHttpProxy, 'HTTP_PROXY') : ''
const containerHttpsProxy = hostHttpsProxy ? containerProxyUrl(hostHttpsProxy, 'HTTPS_PROXY') : ''
const containerNoProxy = [
  process.env.NO_PROXY || process.env.no_proxy,
  'host.docker.internal',
  'localhost',
  '127.0.0.1',
  '::1',
]
  .filter(Boolean)
  .join(',')

const maximumCapturedOutputLength = 1_000_000

function run(command, args, env = process.env, { captureOutput = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    })
    let output = ''
    const forward = (stream, chunk) => {
      stream.write(chunk)
      output = `${output}${chunk}`.slice(-maximumCapturedOutputLength)
    }
    if (captureOutput) {
      child.stdout.on('data', (chunk) => forward(process.stdout, chunk))
      child.stderr.on('data', (chunk) => forward(process.stderr, chunk))
    }
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        const error = new Error(`${command} failed with ${signal || `exit code ${code}`}`)
        error.output = output
        reject(error)
      }
    })
  })
}

function isTransientActFailure(error) {
  return [
    /\b(?:EAI_AGAIN|ECONNRESET|ETIMEDOUT)\b/i,
    /connection reset by peer/i,
    /network is unreachable/i,
    /no route to host/i,
    /temporary failure in name resolution/i,
    /TLS handshake timeout/i,
    /unexpected EOF/i,
  ].some((pattern) => pattern.test(error.output || ''))
}

async function runWithRetries(
  command,
  args,
  env,
  { attempts = 2, beforeRetry, shouldRetry = () => false } = {}
) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run(command, args, env, { captureOutput: true })
    } catch (error) {
      lastError = error
      if (attempt === attempts || !shouldRetry(error)) {
        break
      }
      await beforeRetry?.()
      console.warn(`${command} attempt ${attempt} failed; retrying local verification`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000))
    }
  }
  throw lastError
}

async function requestBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function startBotRunMockServer() {
  const requests = []
  const server = http.createServer((request, response) => {
    void (async () => {
      const body = await requestBody(request)
      requests.push({ method: request.method, url: request.url, headers: request.headers, body })

      if (request.method === 'PUT') {
        response.writeHead(200, { etag: `"act-${requests.length}"` })
        response.end()
        return
      }
      if (request.method === 'POST' && request.url === '/wecom') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{"errcode":0,"errmsg":"ok"}')
        return
      }

      response.writeHead(404)
      response.end()
    })().catch((error) => {
      response.writeHead(500, { 'content-type': 'text/plain' })
      response.end(error.message)
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '0.0.0.0', resolve)
  })

  return {
    port: server.address().port,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

function assertBotRunRequests(requests) {
  const uploads = requests.filter(({ method }) => method === 'PUT')
  const inspections = requests.filter(({ method }) => method === 'HEAD')
  const deliveries = requests.filter(({ method, url }) => method === 'POST' && url === '/wecom')
  const notificationUploads = uploads.filter(({ url }) => url.includes('/notification-images/'))
  const originalUploads = uploads.filter(({ url }) => url.includes('/originals/'))
  const brandingUploads = uploads.filter(({ url }) => url.includes('/branding-icons/'))
  if (
    uploads.length !== 5 ||
    inspections.length !== 3 ||
    notificationUploads.length !== 1 ||
    originalUploads.length !== 1 ||
    brandingUploads.length !== 3 ||
    deliveries.length !== 1
  ) {
    throw new Error(
      `Expected five S3 uploads, three branding inspections, and one WeCom delivery; received ${uploads.length}, ${inspections.length}, and ${deliveries.length}`
    )
  }
  if (uploads.some(({ headers }) => headers['cache-control'] !== 'public, max-age=31536000, immutable')) {
    throw new Error('Local Bot Run did not publish every S3 object with immutable caching')
  }

  const payload = JSON.parse(deliveries[0].body.toString('utf8'))
  const imageUrl = payload.template_card?.card_image?.url
  const iconUrl = payload.template_card?.source?.icon_url
  if (!/^https:\/\/assets\.example\.com\/act\/notification-images\/[a-f0-9]{64}\/schedules\.png$/.test(imageUrl)) {
    throw new Error(`Local Bot Run produced an unexpected WeCom image URL: ${imageUrl}`)
  }
  if (!/^https:\/\/assets\.example\.com\/act\/branding-icons\/[a-f0-9]{64}\/schedules\.png$/.test(iconUrl)) {
    throw new Error(`Local Bot Run produced an unexpected WeCom icon URL: ${iconUrl}`)
  }
}

const dockerHost = (
  await execFileAsync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
).stdout.trim()

await run('docker', ['build', '--tag', gitleaksImage, '.github/gitleaks'])
for (const command of ['git', 'dir']) {
  await run('docker', [
    'run',
    '--rm',
    '--volume',
    `${process.cwd()}:/repo:ro`,
    '--workdir',
    '/repo',
    gitleaksImage,
    command,
    '--no-banner',
    '--no-color',
    '--redact',
    '--gitleaks-ignore-path',
    '/repo/.gitleaksignore',
    command === 'git' ? '/repo' : '.',
  ])
}

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
    '--build-arg',
    `NPM_REGISTRY=${actNpmRegistry}`,
    '--build-arg',
    `CHROME_DOWNLOAD_BASE_URL=${actChromeDownloadBaseUrl}`,
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

const actEnvironment = { ...process.env, DOCKER_HOST: dockerHost }
const commonActArguments = [
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
  '--env',
  `npm_config_registry=${actNpmRegistry}`,
  '--env',
  `PNPM_CONFIG_NETWORK_CONCURRENCY=${actNetworkConcurrency}`,
]
if (containerHttpProxy || containerHttpsProxy) {
  commonActArguments.push(
    '--env',
    `HTTP_PROXY=${containerHttpProxy}`,
    '--env',
    `HTTPS_PROXY=${containerHttpsProxy}`,
    '--env',
    `NO_PROXY=${containerNoProxy}`,
    '--env',
    'NODE_USE_ENV_PROXY=1'
  )
}

await runWithRetries(
  'act',
  ['push', '--workflows', '.github/workflows/ci.yml', '--job', 'verify', ...commonActArguments],
  actEnvironment,
  { shouldRetry: isTransientActFailure }
)

const mockServer = await startBotRunMockServer()
const botRunDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon3-bot-act-run-'))
const containerBotRunDirectory = '/tmp/splatoon3-bot-act-run'
const s3Configuration = `bucket: splatoon-assets
region: us-east-1
endpoint: http://host.docker.internal:${mockServer.port}
forcePathStyle: true
keyPrefix: act
publicBaseUrl: https://assets.example.com
accessKeyId: act-access-key
secretAccessKey: act-secret-key`
const weComConfiguration = `- name: local-verification
  webhookUrl: http://host.docker.internal:${mockServer.port}/wecom`

try {
  await runWithRetries(
    'act',
    [
      'workflow_dispatch',
      '--workflows',
      '.github/workflows/notification-smoke.yml',
      '--input',
      'profile=schedules',
      '--input',
      'channel=wecom',
      '--container-options',
      `--volume=${botRunDirectory}:${containerBotRunDirectory}`,
      '--env',
      `ACT_BOT_RUN_DIRECTORY=${containerBotRunDirectory}`,
      '--secret',
      `S3_CONFIG=${s3Configuration}`,
      '--secret',
      `BOT_WECOM_CONFIG=${weComConfiguration}`,
      ...commonActArguments,
    ],
    actEnvironment,
    {
      shouldRetry: isTransientActFailure,
      beforeRetry: async () => {
        mockServer.requests.splice(0)
        await fs.rm(botRunDirectory, { recursive: true, force: true })
        await fs.mkdir(botRunDirectory, { recursive: true })
      },
    }
  )
  assertBotRunRequests(mockServer.requests)
} finally {
  await mockServer.close()
  await fs.rm(botRunDirectory, { recursive: true, force: true })
}
