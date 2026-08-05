import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { acquireDataSnapshot, downloadDataSnapshot, loadDataSnapshot } from '../bot/data/DataSnapshot.mjs'
import { supportedBotLocales } from '../src/common/botLocale.mjs'

const emptyLocaleSnapshot = Object.freeze({
  stages: {},
  rules: {},
  weapons: {},
  bosses: {},
  brands: {},
  events: {},
  festivals: {},
  gear: {},
  powers: {},
})

const validSnapshot = {
  schedules: {
    data: {
      regularSchedules: { nodes: [] },
      bankaraSchedules: { nodes: [] },
      xSchedules: { nodes: [] },
      eventSchedules: { nodes: [] },
      festSchedules: { nodes: [] },
      coopGroupingSchedule: {
        regularSchedules: { nodes: [] },
        bigRunSchedules: { nodes: [] },
        teamContestSchedules: { nodes: [] },
      },
      currentFest: null,
      vsStages: { nodes: [] },
    },
  },
  gear: { data: { gesotown: { pickupBrand: null, limitedGears: [] } } },
  festivals: {},
  coop: { data: { coopResult: { monthlyGear: null } } },
  ...Object.fromEntries(supportedBotLocales.map((locale) => [`locale/${locale}`, emptyLocaleSnapshot])),
}

async function startSnapshotServer(values) {
  const server = http.createServer((request, response) => {
    const name = request.url.replace(/^\//, '').replace(/\.json$/, '')
    const value = values[name]
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(value))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

test('ships the deterministic fixture with a verified Data Snapshot Manifest', async () => {
  const snapshot = await loadDataSnapshot(path.join(import.meta.dirname, 'fixtures/data'))

  assert.equal(snapshot.manifest.createdAt, '2026-07-29T19:00:00.000Z')
  assert.equal(snapshot.manifestSha256, 'd7c5a5e88d82efed986c8977764d5cab034235badf6896726e840ca0a22f9b50')
  assert.equal(Object.keys(snapshot.manifest.files).length, 4 + supportedBotLocales.length)
})

test('publishes one validated Data Snapshot', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-snapshot-'))
  const destinationDirectory = path.join(temporaryDirectory, 'data')
  const server = await startSnapshotServer(validSnapshot)
  context.after(async () => {
    await server.close()
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  const manifest = await downloadDataSnapshot({
    sourceBaseUrl: server.baseUrl,
    destinationDirectory,
    createdAt: new Date('2026-07-30T00:00:00Z'),
  })
  const snapshot = await loadDataSnapshot(destinationDirectory)

  assert.equal(manifest.createdAt, '2026-07-30T00:00:00.000Z')
  assert.equal(Object.keys(manifest.files).length, 4 + supportedBotLocales.length)
  assert.deepEqual(snapshot.values.gear, validSnapshot.gear)
})

test('keeps the previous snapshot when validation fails', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-snapshot-failure-'))
  const destinationDirectory = path.join(temporaryDirectory, 'data')
  await fs.mkdir(destinationDirectory, { recursive: true })
  await fs.writeFile(path.join(destinationDirectory, 'marker.txt'), 'previous snapshot')
  const server = await startSnapshotServer({ ...validSnapshot, gear: { invalid: true } })
  context.after(async () => {
    await server.close()
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  await assert.rejects(
    downloadDataSnapshot({ sourceBaseUrl: server.baseUrl, destinationDirectory, attempts: 1 }),
    /Invalid gear snapshot data/
  )
  assert.equal(await fs.readFile(path.join(destinationDirectory, 'marker.txt'), 'utf8'), 'previous snapshot')
})

test('verifies Data Snapshot file hashes when loading an archived Bot Run', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-snapshot-integrity-'))
  const destinationDirectory = path.join(temporaryDirectory, 'data')
  const server = await startSnapshotServer(validSnapshot)
  context.after(async () => {
    await server.close()
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  await downloadDataSnapshot({ sourceBaseUrl: server.baseUrl, destinationDirectory })
  await fs.appendFile(path.join(destinationDirectory, 'gear.json'), '\n')

  await assert.rejects(loadDataSnapshot(destinationDirectory), /integrity verification failed for gear.json/)
})

test('restores only a validated Last-known-good Data Snapshot after a fresh download fails', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-snapshot-fallback-'))
  const destinationDirectory = path.join(temporaryDirectory, 'data')
  const fallbackDirectory = path.join(temporaryDirectory, 'last-known-good')
  const server = await startSnapshotServer(validSnapshot)
  context.after(async () => {
    await server.close()
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  await downloadDataSnapshot({
    sourceBaseUrl: server.baseUrl,
    destinationDirectory: fallbackDirectory,
    createdAt: new Date('2026-07-30T00:00:00Z'),
  })
  const result = await acquireDataSnapshot({
    destinationDirectory,
    fallbackDirectory,
    attempts: 1,
    fetchImpl: async () => {
      throw new Error('upstream unavailable')
    },
  })

  assert.equal(result.acquisition, 'fallback')
  assert.match(result.fallbackReason, /upstream unavailable/)
  assert.equal(result.snapshot.manifest.createdAt, '2026-07-30T00:00:00.000Z')
  assert.deepEqual((await loadDataSnapshot(destinationDirectory)).values.gear, validSnapshot.gear)
})

test('keeps a validated fresh Data Snapshot when updating the fallback cache fails', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-data-cache-warning-'))
  const destinationDirectory = path.join(root, 'data')
  const fallbackParent = path.join(root, 'fallback-parent-file')
  const fallbackDirectory = path.join(fallbackParent, 'cache')
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.writeFile(fallbackParent, 'not a directory')

  const result = await acquireDataSnapshot({
    destinationDirectory,
    fallbackDirectory,
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    fetchImpl: async (url) => {
      const relativePath = new URL(url).pathname.replace('/data/', '')
      return new Response(
        await fs.readFile(path.join(import.meta.dirname, 'fixtures/data', relativePath)),
        { status: 200 }
      )
    },
    attempts: 1,
  })

  assert.equal(result.acquisition, 'fresh')
  assert.match(result.cacheWarning, /Last-known-good cache could not be updated/)
  assert.equal(result.snapshot.manifest.createdAt, '2026-08-05T00:00:00.000Z')
})

test('fails with both causes when neither fresh nor fallback Data Snapshot is valid', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-snapshot-no-fallback-'))
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))

  await assert.rejects(
    acquireDataSnapshot({
      destinationDirectory: path.join(temporaryDirectory, 'data'),
      fallbackDirectory: path.join(temporaryDirectory, 'missing'),
      attempts: 1,
      fetchImpl: async () => {
        throw new Error('upstream unavailable')
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError)
      assert.match(error.message, /no valid Last-known-good Data Snapshot/)
      assert.equal(error.errors.length, 2)
      return true
    }
  )
})
