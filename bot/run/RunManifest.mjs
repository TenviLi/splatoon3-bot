import path from 'node:path'
import { z } from 'zod'
import { botTimeZoneSchema } from '../config/BotTimeZone.mjs'
import { screenshotAttributionSchema } from '../config/ScreenshotAttribution.mjs'
import { readManifestFile, writeManifestFile } from '../manifest/ManifestFile.mjs'
import { getRunPlan, getScreenshotDefinition } from './RunPlan.mjs'

const runManifestSchema = z.object({
  version: z.literal(3),
  profile: z.string().min(1),
  renderTime: z.number().int().nonnegative(),
  timeZone: botTimeZoneSchema,
  screenshotAttribution: screenshotAttributionSchema,
  snapshot: z
    .object({
      createdAt: z.string().min(1),
      source: z.string().min(1),
      manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  artifacts: z.array(
    z
      .object({
        name: z.string().min(1),
        filename: z.string().min(1),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        browserVersion: z.string().min(1),
      })
      .strict()
  ),
}).strict()

export const defaultRunManifestFilename = path.join('screenshots', 'run-manifest.json')

export function validateRunManifest(value) {
  const manifest = runManifestSchema.parse(value)
  const plan = getRunPlan(manifest.profile)

  if (manifest.artifacts.length !== plan.screenshots.length) {
    throw new Error(
      `Run manifest for ${plan.name} contains ${manifest.artifacts.length} artifacts, expected ${plan.screenshots.length}`
    )
  }

  for (const [index, screenshotName] of plan.screenshots.entries()) {
    const artifact = manifest.artifacts[index]
    const definition = getScreenshotDefinition(screenshotName)

    if (artifact.name !== screenshotName) {
      throw new Error(`Run manifest artifact ${index + 1} is ${artifact.name}, expected ${screenshotName}`)
    }
    if (path.basename(artifact.filename) !== definition.outputFilename) {
      throw new Error(
        `Run manifest artifact ${artifact.name} uses ${path.basename(artifact.filename)}, expected ${definition.outputFilename}`
      )
    }
  }

  return manifest
}

export async function writeRunManifest(value, filename = defaultRunManifestFilename) {
  return writeManifestFile({ filename, value, validate: validateRunManifest })
}

export async function readRunManifest(filename = defaultRunManifestFilename) {
  return readManifestFile({ filename, validate: validateRunManifest })
}
