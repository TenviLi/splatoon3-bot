import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readRunManifest, validateRunManifest, writeRunManifest } from '../bot/run/RunManifest.mjs'

function createManifest(overrides = {}) {
  return {
    version: 5,
    selection: ['schedules'],
    renderTime: Date.parse('2026-07-30T00:00:00Z'),
    timeZone: 'Asia/Shanghai',
    locale: 'zh-CN',
    resolution: '2400x1350',
    screenshotAttribution: 'splatoon3.ink',
    snapshot: {
      createdAt: '2026-07-30T00:00:00.000Z',
      source: 'https://splatoon3.ink/data',
      manifestSha256: 'c'.repeat(64),
    },
    artifacts: [
      {
        name: 'schedules',
        filename: '/temporary/screenshots/schedules.png',
        bytes: 123,
        sha256: 'a'.repeat(64),
        browserVersion: '138.0.0.0',
        width: 2400,
        height: 1350,
      },
    ],
    ...overrides,
  }
}

test('writes and reads a valid Run Manifest atomically', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-manifest-'))
  const filename = path.join(temporaryDirectory, 'run-manifest.json')
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))

  await writeRunManifest(createManifest(), filename)

  assert.deepEqual(await readRunManifest(filename), createManifest())
})

test('requires exactly the ordered Screenshot Artifacts selected by the Run Selection', () => {
  assert.throws(
    () => validateRunManifest(createManifest({ artifacts: [] })),
    /contains 0 artifacts, expected 1/
  )
  assert.throws(
    () =>
      validateRunManifest(
        createManifest({
          artifacts: [{ ...createManifest().artifacts[0], name: 'salmon-run', filename: 'salmon-run.png' }],
        })
      ),
    /is salmon-run, expected schedules/
  )
})

test('requires the stable output filename from the Screenshot Definition', () => {
  assert.throws(
    () =>
      validateRunManifest(
        createManifest({ artifacts: [{ ...createManifest().artifacts[0], filename: 'renamed.png' }] })
      ),
    /uses renamed.png, expected schedules.png/
  )
})

test('requires a valid IANA time zone', () => {
  assert.throws(
    () => validateRunManifest(createManifest({ timeZone: 'Mars/Inkling' })),
    /must be a valid IANA time zone/
  )
})

test('requires a valid screenshot attribution', () => {
  assert.throws(
    () => validateRunManifest(createManifest({ screenshotAttribution: 'a'.repeat(41) })),
    /must not exceed 40 characters/
  )
})

test('requires supported locale, resolution, and artifact geometry', () => {
  assert.equal(validateRunManifest(createManifest({ locale: 'fr-FR' })).locale, 'fr-FR')
  assert.throws(() => validateRunManifest(createManifest({ locale: 'pt-BR' })), /must be one of/)
  assert.throws(() => validateRunManifest(createManifest({ resolution: '2560x1440' })), /Invalid option/)
  assert.throws(
    () =>
      validateRunManifest(
        createManifest({ artifacts: [{ ...createManifest().artifacts[0], width: 1920, height: 1080 }] })
      ),
    /expected 2400x1350/
  )
})

test('rejects the incompatible Run Manifest version 4 schema', () => {
  assert.throws(() => validateRunManifest(createManifest({ version: 4 })), /Invalid input/)
})

test('requires canonical Run Selection ordering', () => {
  assert.throws(
    () => validateRunManifest(createManifest({ selection: ['gear', 'schedules'] })),
    /canonical order: schedules,gear/
  )
})
