import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  localizeFixtureDataFiles,
  localizeJsonSource,
  refreshSnapshotManifest,
} from './support/FixtureLocalization.mjs'

test('localizes only exact JSON string values and preserves valid JSON', () => {
  const remoteUrl = 'https://example.com/image.png'
  const source = JSON.stringify({
    exact: remoteUrl,
    embedded: `preview: ${remoteUrl}`,
    other: 'https://example.com/other.png',
  }, null, 2)
  const localized = localizeJsonSource(source, new Map([[remoteUrl, '/fixture-assets/image.png']]))

  assert.deepEqual(JSON.parse(localized), {
    exact: '/fixture-assets/image.png',
    embedded: `preview: ${remoteUrl}`,
    other: 'https://example.com/other.png',
  })
})

test('rewrites fixture files and refreshes every Manifest hash and byte count', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-fixture-localization-'))
  context.after(() => fs.rm(directory, { recursive: true, force: true }))
  const remoteUrl = 'https://example.com/image.png'
  const files = {
    'one.json': `${JSON.stringify({ image: remoteUrl })}\n`,
    'nested/two.json': `${JSON.stringify({ image: 'unchanged' })}\n`,
  }
  for (const [relativeFilename, source] of Object.entries(files)) {
    const filename = path.join(directory, relativeFilename)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, source)
  }
  await fs.writeFile(path.join(directory, '.snapshot.json'), `${JSON.stringify({
    version: 1,
    createdAt: '2026-07-29T19:00:00.000Z',
    source: 'https://splatoon3.ink/data',
    files: Object.fromEntries(Object.keys(files).map((filename) => [filename, { sha256: '0'.repeat(64), bytes: 1 }])),
  }, null, 2)}\n`)

  assert.deepEqual(
    await localizeFixtureDataFiles(directory, Object.keys(files), new Map([[remoteUrl, '/fixture-assets/image.png']])),
    ['one.json']
  )
  const snapshot = await refreshSnapshotManifest(directory)
  for (const relativeFilename of Object.keys(files)) {
    const buffer = await fs.readFile(path.join(directory, relativeFilename))
    assert.deepEqual(snapshot.files[relativeFilename], {
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      bytes: buffer.byteLength,
    })
  }
  assert.equal(snapshot.createdAt, '2026-07-29T19:00:00.000Z')
  assert.equal(snapshot.source, 'https://splatoon3.ink/data')
})
