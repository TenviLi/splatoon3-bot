import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PNG } from 'pngjs'
import sharp from 'sharp'
import { parseS3Configuration } from '../bot/publish/S3Configuration.mjs'
import { publishToS3 } from '../bot/publish/S3Publisher.mjs'
import {
  assertPublicationManifestMatchesRun,
  readPublicationManifest,
  validatePublicationManifest,
} from '../bot/publish/PublicationManifest.mjs'
import { readRunManifest, writeRunManifest } from '../bot/run/RunManifest.mjs'

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function createBotRun(directory, { width = 2_400, height = 1_350 } = {}) {
  const screenshot = new PNG({ width, height })
  const buffer = PNG.sync.write(screenshot)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'schedules.png'), buffer)
  await fs.writeFile(path.join(directory, 'unselected.png'), 'must not be published')
  await writeRunManifest(
    {
      version: 3,
      profile: 'schedules',
      renderTime: Date.parse('2026-07-30T00:00:00Z'),
      timeZone: 'Asia/Shanghai',
      screenshotAttribution: 'splatoon3.ink',
      snapshot: {
        createdAt: '2026-07-30T00:00:00.000Z',
        source: 'https://splatoon3.ink/data',
        manifestSha256: 'c'.repeat(64),
      },
      artifacts: [
        {
          name: 'schedules',
          filename: '/prepare-runner/screenshots/schedules.png',
          bytes: buffer.byteLength,
          sha256: sha256(buffer),
          browserVersion: '138.0.0.0',
        },
      ],
    },
    path.join(directory, 'run-manifest.json')
  )
  return buffer
}

const configuration = Object.freeze({
  bucket: 'splatoon-assets',
  region: 'us-east-1',
  endpoint: 'https://s3.example.com',
  forcePathStyle: true,
  keyPrefix: 'bot/production',
  publicBaseUrl: 'https://cdn.example.com/assets',
  credentials: Object.freeze({ accessKeyId: 'access-key', secretAccessKey: 'secret-key' }),
})
const branding = Object.freeze({
  icons: Object.freeze({
    schedules: 'https://brand.example.com/icon.png',
    salmonRun: 'https://brand.example.com/icon2.png',
    gear: 'https://brand.example.com/icon3.png',
  }),
})

test('publishes verified notification and original PNG variants through S3', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-s3-publisher-'))
  const screenshotDirectory = path.join(temporaryDirectory, 'screenshots')
  const uploads = []
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))
  const originalBuffer = await createBotRun(screenshotDirectory)

  const manifest = await publishToS3({
    profileName: 'schedules',
    configuration,
    branding,
    screenshotDirectory,
    client: { send: async (command) => uploads.push(command.input) },
  })

  const originalUpload = uploads.find(({ Key }) => Key.includes('/originals/'))
  const notificationUpload = uploads.find(({ Key }) => Key.includes('/notification-images/'))
  assert.deepEqual(
    uploads.map(({ Key }) => Key).sort(),
    [
      `bot/production/notification-images/${sha256(notificationUpload.Body)}/schedules.png`,
      `bot/production/originals/${sha256(originalBuffer)}/schedules.png`,
    ].sort()
  )
  assert.deepEqual(originalUpload.Body, originalBuffer)
  assert.equal(notificationUpload.ContentType, 'image/png')
  assert.equal(notificationUpload.CacheControl, 'public, max-age=31536000, immutable')
  assert.equal(notificationUpload.Metadata['source-sha256'], sha256(originalBuffer))
  const metadata = await sharp(notificationUpload.Body).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.width, 1_024)
  assert.equal(metadata.height, 576)
  assert.equal(manifest.assetBaseUrl, 'https://cdn.example.com/assets/bot/production')
  assert.equal(manifest.version, 2)
  assert.equal(manifest.runManifestVersion, 3)
  assert.equal(manifest.timeZone, 'Asia/Shanghai')
  assert.equal(manifest.screenshotAttribution, 'splatoon3.ink')
  assert.equal(manifest.snapshotManifestSha256, 'c'.repeat(64))
  assert.equal(
    manifest.artifacts[0].notificationImage.url,
    `https://cdn.example.com/assets/bot/production/notification-images/${sha256(notificationUpload.Body)}/schedules.png`
  )
  assert.equal(
    manifest.artifacts[0].originalImage.url,
    `https://cdn.example.com/assets/bot/production/originals/${sha256(originalBuffer)}/schedules.png`
  )
  assert.deepEqual(manifest.branding, branding)
  assert.deepEqual(await readPublicationManifest(path.join(screenshotDirectory, 'publication-manifest.json')), manifest)
  const runManifest = await readRunManifest(path.join(screenshotDirectory, 'run-manifest.json'))
  assert.deepEqual(assertPublicationManifestMatchesRun(manifest, runManifest), manifest)
  assert.throws(
    () => assertPublicationManifestMatchesRun(manifest, { ...runManifest, renderTime: manifest.renderTime + 1 }),
    /render time/
  )
  assert.throws(
    () =>
      assertPublicationManifestMatchesRun(manifest, {
        ...runManifest,
        artifacts: [{ ...runManifest.artifacts[0], sha256: 'c'.repeat(64) }],
      }),
    /does not match Run Manifest artifact/
  )
  assert.throws(
    () => assertPublicationManifestMatchesRun(manifest, { ...runManifest, timeZone: 'UTC' }),
    /time zone/
  )
  assert.throws(
    () =>
      assertPublicationManifestMatchesRun(manifest, {
        ...runManifest,
        screenshotAttribution: 'custom.example',
      }),
    /screenshot attribution/
  )
  assert.throws(
    () =>
      assertPublicationManifestMatchesRun(manifest, {
        ...runManifest,
        snapshot: { ...runManifest.snapshot, manifestSha256: 'd'.repeat(64) },
      }),
    /Data Snapshot Manifest/
  )
  const foreignUrlManifest = structuredClone(manifest)
  foreignUrlManifest.artifacts[0].notificationImage.url =
    `https://foreign.example.com/notification-images/${foreignUrlManifest.artifacts[0].notificationImage.sha256}/schedules.png`
  assert.throws(() => validatePublicationManifest(foreignUrlManifest), /must be below assetBaseUrl/)

  const nestedUrlManifest = structuredClone(manifest)
  nestedUrlManifest.artifacts[0].notificationImage.url = nestedUrlManifest.artifacts[0].notificationImage.url.replace(
    '/notification-images/',
    '/unexpected/notification-images/'
  )
  assert.throws(() => validatePublicationManifest(nestedUrlManifest), /must exactly match assetBaseUrl/)
})

test('refuses to publish a screenshot that does not match the Run Manifest', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-s3-invalid-'))
  const screenshotDirectory = path.join(temporaryDirectory, 'screenshots')
  const uploads = []
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))
  await createBotRun(screenshotDirectory)
  await fs.writeFile(path.join(screenshotDirectory, 'schedules.png'), 'tampered')

  await assert.rejects(
    publishToS3({
      profileName: 'schedules',
      configuration,
      branding,
      screenshotDirectory,
      client: { send: async (command) => uploads.push(command.input) },
    }),
    /Screenshot artifact schedules/
  )
  assert.deepEqual(uploads, [])
})

test('rejects unexpected screenshot geometry before any S3 request', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-s3-geometry-'))
  const screenshotDirectory = path.join(temporaryDirectory, 'screenshots')
  const uploads = []
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))
  await createBotRun(screenshotDirectory, { width: 1, height: 1 })

  await assert.rejects(
    publishToS3({
      profileName: 'schedules',
      configuration,
      branding,
      screenshotDirectory,
      client: { send: async (command) => uploads.push(command.input) },
    }),
    /expected 2400x1350 PNG/
  )
  assert.deepEqual(uploads, [])
})

test('uses signed path-style PUT requests with a local S3-compatible endpoint', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-s3-http-'))
  const screenshotDirectory = path.join(temporaryDirectory, 'screenshots')
  const requests = []
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks),
      })
      response.writeHead(200, { etag: `"${requests.length}"` })
      response.end()
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  context.after(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })
  await createBotRun(screenshotDirectory)

  await publishToS3({
    profileName: 'schedules',
    configuration: parseS3Configuration(`
bucket: splatoon-assets
endpoint: http://127.0.0.1:${server.address().port}
forcePathStyle: true
keyPrefix: bot/production
publicBaseUrl: https://cdn.example.com
credentials:
  accessKeyId: access-key
  secretAccessKey: secret-key
`),
    branding,
    screenshotDirectory,
  })

  assert.equal(requests.length, 2)
  assert.ok(requests.every(({ method }) => method === 'PUT'))
  assert.ok(
    requests.some(({ url }) =>
      /^\/splatoon-assets\/bot\/production\/notification-images\/[a-f0-9]{64}\/schedules\.png\?x-id=PutObject$/.test(
        url
      )
    )
  )
  assert.ok(
    requests.some(({ url }) =>
      /^\/splatoon-assets\/bot\/production\/originals\/[a-f0-9]{64}\/schedules\.png\?x-id=PutObject$/.test(
        url
      )
    )
  )
  for (const request of requests) {
    assert.match(request.headers.authorization, /^AWS4-HMAC-SHA256 Credential=access-key\//)
    assert.equal(request.headers['content-type'], 'image/png')
    assert.equal(Number(request.headers['content-length']), request.body.byteLength)
  }
})

test('parses one strict YAML S3_CONFIG with provider-neutral credentials', () => {
  assert.deepEqual(
    parseS3Configuration(`
bucket: splatoon-assets
endpoint: https://s3.api.upyun.com
forcePathStyle: true
keyPrefix: bot/production
publicBaseUrl: https://splatoon.example.com
credentials:
  accessKeyId: access-key
  secretAccessKey: secret-key
`),
    {
      bucket: 'splatoon-assets',
      region: 'us-east-1',
      endpoint: 'https://s3.api.upyun.com',
      forcePathStyle: true,
      keyPrefix: 'bot/production',
      publicBaseUrl: 'https://splatoon.example.com',
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' },
    }
  )

  assert.throws(
    () => parseS3Configuration('bucket: one\nbucket: two\npublicBaseUrl: https://cdn.example.com'),
    /Invalid YAML in S3_CONFIG/
  )
  assert.throws(
    () => parseS3Configuration('bucket: one\npublicBaseUrl: http://cdn.example.com'),
    /Invalid configuration in S3_CONFIG/
  )
  assert.throws(
    () =>
      parseS3Configuration(
        'bucket: one\nkeyPrefix: bot//production\npublicBaseUrl: https://cdn.example.com'
      ),
    /keyPrefix must not contain empty path segments/
  )
  assert.throws(
    () => parseS3Configuration('bucket: one\npublicBaseUrl: https://cdn.example.com'),
    /Invalid configuration in S3_CONFIG/
  )
})
