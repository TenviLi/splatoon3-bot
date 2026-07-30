import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const connectionSchema = z.object({ nodes: z.array(z.unknown()) }).loose()
const schedulesSchema = z.object({
  data: z.object({
    regularSchedules: connectionSchema,
    bankaraSchedules: connectionSchema,
    coopGroupingSchedule: z.object({ regularSchedules: connectionSchema }).loose(),
    vsStages: connectionSchema,
  }).loose(),
}).loose()
const gearSchema = z.object({
  data: z.object({
    gesotown: z.object({
      pickupBrand: z.unknown().nullable(),
      limitedGears: z.array(z.unknown()),
    }).loose(),
  }).loose(),
}).loose()
const festivalsSchema = z.record(z.string(), z.unknown())
const coopSchema = z.object({ data: z.unknown() }).loose()
const localeSchema = z.object({
  stages: z.record(z.string(), z.unknown()),
  rules: z.record(z.string(), z.unknown()),
  weapons: z.record(z.string(), z.unknown()),
  brands: z.record(z.string(), z.unknown()),
  gear: z.record(z.string(), z.unknown()),
  powers: z.record(z.string(), z.unknown()),
}).loose()

const snapshotFiles = Object.freeze([
  Object.freeze({ name: 'schedules', relativePath: 'schedules.json', schema: schedulesSchema }),
  Object.freeze({ name: 'gear', relativePath: 'gear.json', schema: gearSchema }),
  Object.freeze({ name: 'festivals', relativePath: 'festivals.json', schema: festivalsSchema }),
  Object.freeze({ name: 'coop', relativePath: 'coop.json', schema: coopSchema }),
  Object.freeze({ name: 'locale/zh-CN', relativePath: 'locale/zh-CN.json', schema: localeSchema }),
  Object.freeze({ name: 'locale/en-US', relativePath: 'locale/en-US.json', schema: localeSchema }),
])
const snapshotManifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid timestamp'),
  source: z.url(),
  files: z
    .object(
      Object.fromEntries(
        snapshotFiles.map(({ relativePath }) => [
          relativePath,
          z.object({
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            bytes: z.number().int().positive(),
          }).strict(),
        ])
      )
    )
    .strict(),
}).strict()

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function pathExists(filename) {
  try {
    await fs.access(filename)
    return true
  } catch {
    return false
  }
}

function formatValidationError(name, error) {
  if (!(error instanceof z.ZodError)) {
    return error
  }

  const details = error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')
  return new Error(`Invalid ${name} snapshot data: ${details}`, { cause: error })
}

async function fetchSnapshotFile(definition, options) {
  const remoteUrl = new URL(`${definition.name}.json`, `${options.sourceBaseUrl.replace(/\/$/, '')}/`)

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const response = await options.fetchImpl(remoteUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'splatoon3-bot snapshot downloader',
        },
        signal: AbortSignal.timeout(options.timeoutMs),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const text = await response.text()
      const json = JSON.parse(text)
      definition.schema.parse(json)

      return {
        definition,
        json,
        serialized: `${JSON.stringify(json, null, 2)}\n`,
      }
    } catch (error) {
      const normalizedError = formatValidationError(definition.name, error)

      if (attempt === options.attempts || normalizedError.cause instanceof z.ZodError) {
        throw new Error(`Failed to download ${remoteUrl}: ${normalizedError.message}`, { cause: normalizedError })
      }

      await wait(250 * 2 ** (attempt - 1))
    }
  }

  throw new Error(`Failed to download ${remoteUrl}`)
}

async function writeStagedSnapshot(stagingDirectory, files, metadata) {
  await fs.mkdir(stagingDirectory, { recursive: true })
  await fs.writeFile(path.join(stagingDirectory, '.gitkeep'), '')
  await fs.mkdir(path.join(stagingDirectory, 'locale'), { recursive: true })
  await fs.writeFile(path.join(stagingDirectory, 'locale/.gitkeep'), '')

  const manifestFiles = {}

  for (const file of files) {
    const filename = path.join(stagingDirectory, file.definition.relativePath)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, file.serialized)
    manifestFiles[file.definition.relativePath] = {
      sha256: crypto.createHash('sha256').update(file.serialized).digest('hex'),
      bytes: Buffer.byteLength(file.serialized),
    }
  }

  const manifest = {
    version: 1,
    createdAt: metadata.createdAt.toISOString(),
    source: metadata.sourceBaseUrl,
    files: manifestFiles,
  }
  await fs.writeFile(path.join(stagingDirectory, '.snapshot.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  return manifest
}

async function publishStagedSnapshot(stagingDirectory, destinationDirectory) {
  const parentDirectory = path.dirname(destinationDirectory)
  const backupDirectory = path.join(
    parentDirectory,
    `.${path.basename(destinationDirectory)}.backup-${process.pid}-${Date.now()}`
  )
  const hadDestination = await pathExists(destinationDirectory)
  let movedDestination = false

  try {
    if (hadDestination) {
      await fs.rename(destinationDirectory, backupDirectory)
      movedDestination = true
    }

    await fs.rename(stagingDirectory, destinationDirectory)

    if (movedDestination) {
      await fs.rm(backupDirectory, { recursive: true, force: true })
    }
  } catch (error) {
    if (movedDestination && !(await pathExists(destinationDirectory))) {
      await fs.rename(backupDirectory, destinationDirectory)
    }

    throw error
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true })
  }
}

export async function downloadDataSnapshot({
  sourceBaseUrl = 'https://splatoon3.ink/data',
  destinationDirectory = path.join(process.cwd(), 'data'),
  fetchImpl = fetch,
  attempts = 3,
  timeoutMs = 30_000,
  createdAt = new Date(),
} = {}) {
  const absoluteDestination = path.resolve(destinationDirectory)
  const stagingDirectory = path.join(
    path.dirname(absoluteDestination),
    `.${path.basename(absoluteDestination)}.staging-${process.pid}-${Date.now()}`
  )

  await fs.rm(stagingDirectory, { recursive: true, force: true })

  try {
    const files = await Promise.all(
      snapshotFiles.map((definition) =>
        fetchSnapshotFile(definition, { sourceBaseUrl, fetchImpl, attempts, timeoutMs })
      )
    )
    const manifest = await writeStagedSnapshot(stagingDirectory, files, { createdAt, sourceBaseUrl })
    await publishStagedSnapshot(stagingDirectory, absoluteDestination)

    return manifest
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true })
    throw error
  }
}

export async function loadDataSnapshot(directory = path.join(process.cwd(), 'data')) {
  const absoluteDirectory = path.resolve(directory)
  const entries = await Promise.all(
    snapshotFiles.map(async (definition) => {
      const filename = path.join(absoluteDirectory, definition.relativePath)
      const buffer = await fs.readFile(filename)
      const json = JSON.parse(buffer.toString('utf8'))
      definition.schema.parse(json)
      return {
        definition,
        buffer,
        json,
      }
    })
  )

  let manifest = null
  try {
    manifest = snapshotManifestSchema.parse(
      JSON.parse(await fs.readFile(path.join(absoluteDirectory, '.snapshot.json'), 'utf8'))
    )
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  if (manifest) {
    for (const { definition, buffer } of entries) {
      const expected = manifest.files[definition.relativePath]
      const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex')

      if (buffer.byteLength !== expected.bytes || actualSha256 !== expected.sha256) {
        throw new Error(`Data Snapshot integrity verification failed for ${definition.relativePath}`)
      }
    }
  }

  return Object.freeze({
    manifest,
    values: Object.freeze(Object.fromEntries(entries.map(({ definition, json }) => [definition.name, json]))),
  })
}

export function listSnapshotFiles() {
  return snapshotFiles.map(({ name, relativePath }) => ({ name, relativePath }))
}
