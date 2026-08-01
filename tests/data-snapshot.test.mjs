import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { downloadDataSnapshot, loadDataSnapshot } from '../bot/data/DataSnapshot.mjs'

const validSnapshot = {
  schedules: {
    data: {
      regularSchedules: { nodes: [] },
      bankaraSchedules: { nodes: [] },
      coopGroupingSchedule: { regularSchedules: { nodes: [] } },
      vsStages: { nodes: [] },
    },
  },
  gear: { data: { gesotown: { pickupBrand: null, limitedGears: [] } } },
  festivals: {},
  coop: { data: {} },
  'locale/zh-CN': { stages: {}, rules: {}, weapons: {}, brands: {}, gear: {}, powers: {} },
  'locale/en-US': { stages: {}, rules: {}, weapons: {}, brands: {}, gear: {}, powers: {} },
  'locale/ja-JP': { stages: {}, rules: {}, weapons: {}, brands: {}, gear: {}, powers: {} },
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
  assert.equal(snapshot.manifestSha256, '00809cd566248534814327ea99c831bcf3b0c8096537805181e234b0218c1e17')
  assert.equal(Object.keys(snapshot.manifest.files).length, 7)
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
  assert.equal(Object.keys(manifest.files).length, 7)
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
