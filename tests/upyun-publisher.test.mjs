import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { publishToUpyun } from '../bot/publish/UpyunPublisher.mjs'
import { writeRunManifest } from '../bot/run/RunManifest.mjs'

async function createBotRun(directory, buffer = Buffer.from('screenshot')) {
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'schedules.png'), buffer)
  await fs.writeFile(path.join(directory, 'unselected.png'), 'must not be published')
  await writeRunManifest(
    {
      version: 1,
      profile: 'schedules',
      renderTime: Date.parse('2026-07-30T00:00:00Z'),
      snapshot: {
        createdAt: '2026-07-30T00:00:00.000Z',
        source: 'https://splatoon3.ink/data',
      },
      artifacts: [
        {
          name: 'schedules',
          filename: '/prepare-runner/screenshots/schedules.png',
          bytes: buffer.byteLength,
          sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
          browserVersion: '138.0.0.0',
        },
      ],
    },
    path.join(directory, 'run-manifest.json')
  )
}

test('publishes only verified PNG artifacts selected by the Run Profile', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-publisher-'))
  const screenshotDirectory = path.join(temporaryDirectory, 'screenshots')
  const commands = []
  let stagedFiles = []
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))
  await createBotRun(screenshotDirectory)

  await publishToUpyun({
    profileName: 'schedules',
    serviceName: 'bucket',
    operator: 'operator',
    password: 'password',
    executable: 'upx',
    screenshotDirectory,
    runCommand: async (executable, args) => {
      commands.push([executable, ...args])
      if (args.includes('sync')) {
        const sourceDirectory = args.at(-2)
        stagedFiles = await fs.readdir(sourceDirectory)
      }
    },
  })

  assert.deepEqual(stagedFiles, ['schedules.png'])
  assert.deepEqual(
    commands.map((command) => command.slice(1, 3)),
    [
      ['login', 'bucket'],
      ['-q', 'sync'],
      ['logout'],
    ]
  )
})

test('refuses to publish a Screenshot Artifact that does not match the Run Manifest', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-publisher-invalid-'))
  const screenshotDirectory = path.join(temporaryDirectory, 'screenshots')
  const commands = []
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))
  await createBotRun(screenshotDirectory)
  await fs.writeFile(path.join(screenshotDirectory, 'schedules.png'), 'tampered')

  await assert.rejects(
    publishToUpyun({
      profileName: 'schedules',
      serviceName: 'bucket',
      operator: 'operator',
      password: 'password',
      screenshotDirectory,
      runCommand: async (...args) => commands.push(args),
    }),
    /Screenshot artifact schedules/
  )
  assert.deepEqual(commands, [])
})
