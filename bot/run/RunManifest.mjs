import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { getRunPlan, getScreenshotDefinition } from './RunPlan.mjs'

const runManifestSchema = z.object({
  version: z.literal(1),
  profile: z.string().min(1),
  renderTime: z.number().int().nonnegative(),
  snapshot: z.object({
    createdAt: z.string().min(1),
    source: z.string().min(1),
  }),
  artifacts: z.array(
    z.object({
      name: z.string().min(1),
      filename: z.string().min(1),
      bytes: z.number().int().positive(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      browserVersion: z.string().min(1),
    })
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
  const manifest = validateRunManifest(value)
  const absoluteFilename = path.resolve(filename)
  await fs.mkdir(path.dirname(absoluteFilename), { recursive: true })
  const temporaryFilename = `${absoluteFilename}.${process.pid}.tmp`
  await fs.writeFile(temporaryFilename, `${JSON.stringify(manifest, null, 2)}\n`)
  await fs.rename(temporaryFilename, absoluteFilename)
  return manifest
}

export async function readRunManifest(filename = defaultRunManifestFilename) {
  return validateRunManifest(JSON.parse(await fs.readFile(path.resolve(filename), 'utf8')))
}
