import path from 'node:path'
import { z } from 'zod'
import { absoluteUrlSchema } from '../config/AbsoluteUrl.mjs'
import { botTimeZoneSchema } from '../config/BotTimeZone.mjs'
import { brandingConfigurationSchema } from '../config/BrandingConfiguration.mjs'
import { readManifestFile, writeManifestFile } from '../manifest/ManifestFile.mjs'
import { getRunPlan, getScreenshotDefinition } from '../run/RunPlan.mjs'
import { validateRunManifest } from '../run/RunManifest.mjs'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const publishedImageSchema = z
  .object({
    key: z.string().min(1),
    url: absoluteUrlSchema({ label: 'published image URL' }),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict()

const publishedArtifactSchema = z
  .object({
    name: z.string().min(1),
    notificationImage: publishedImageSchema,
    originalImage: publishedImageSchema,
  })
  .strict()

const publicationManifestSchema = z
  .object({
    version: z.literal(1),
    runManifestVersion: z.literal(2),
    profile: z.string().min(1),
    renderTime: z.number().int().nonnegative(),
    timeZone: botTimeZoneSchema,
    snapshotManifestSha256: sha256Schema,
    assetBaseUrl: absoluteUrlSchema({ label: 'assetBaseUrl' }),
    branding: brandingConfigurationSchema,
    artifacts: z.array(publishedArtifactSchema),
  })
  .strict()

const publicationDirectories = Object.freeze({
  notificationImage: 'notification-images',
  originalImage: 'originals',
})

export const defaultPublicationManifestFilename = path.join('screenshots', 'publication-manifest.json')

export function publicationImageRelativeKey(variant, sha256, outputFilename) {
  const directory = publicationDirectories[variant]
  if (!directory) {
    throw new Error(`Unknown publication image variant: ${variant}`)
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Invalid publication image SHA-256: ${sha256}`)
  }
  if (path.posix.basename(outputFilename) !== outputFilename) {
    throw new Error(`Publication output filename must be a basename: ${outputFilename}`)
  }
  return `${directory}/${sha256}/${outputFilename}`
}

function decodedPathname(url, label) {
  try {
    return new URL(url).pathname
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/')
  } catch (error) {
    throw new Error(`${label} contains invalid URL path encoding`, { cause: error })
  }
}

function contentAddressedUrl(assetBaseUrl, relativeKey) {
  const url = new URL(assetBaseUrl)
  const basePath = url.pathname.replace(/\/+$/, '')
  const encodedKey = relativeKey.split('/').map(encodeURIComponent).join('/')
  url.pathname = `${basePath}/${encodedKey}`
  return url
}

function assertPublishedImage(manifest, artifactName, variant, image, expectedDimensions) {
  const definition = getScreenshotDefinition(artifactName)
  const expectedSuffix = publicationImageRelativeKey(variant, image.sha256, definition.outputFilename)
  if (image.key !== expectedSuffix && !image.key.endsWith(`/${expectedSuffix}`)) {
    throw new Error(`Publication ${variant} key for ${artifactName} must end with ${expectedSuffix}`)
  }

  const baseUrl = new URL(manifest.assetBaseUrl)
  const imageUrl = new URL(image.url)
  const basePath = decodedPathname(baseUrl, 'assetBaseUrl').replace(/\/+$/, '')
  const imagePath = decodedPathname(imageUrl, `Publication ${variant} URL`)
  const basePrefix = `${basePath}/`.replace(/^\/\//, '/')
  if (imageUrl.origin !== baseUrl.origin || !imagePath.startsWith(basePrefix)) {
    throw new Error(`Publication ${variant} URL for ${artifactName} must be below assetBaseUrl`)
  }
  const expectedUrl = contentAddressedUrl(baseUrl, expectedSuffix)
  if (imageUrl.href !== expectedUrl.href) {
    throw new Error(
      `Publication ${variant} URL for ${artifactName} must exactly match assetBaseUrl plus ${expectedSuffix}`
    )
  }

  if (image.width !== expectedDimensions.width || image.height !== expectedDimensions.height) {
    throw new Error(
      `Publication ${variant} for ${artifactName} is ${image.width}x${image.height}, expected ${expectedDimensions.width}x${expectedDimensions.height}`
    )
  }
}

export function validatePublicationManifest(value) {
  const manifest = publicationManifestSchema.parse(value)
  const plan = getRunPlan(manifest.profile)

  if (manifest.artifacts.length !== plan.screenshots.length) {
    throw new Error(
      `Publication manifest for ${plan.name} contains ${manifest.artifacts.length} artifacts, expected ${plan.screenshots.length}`
    )
  }

  for (const [index, screenshotName] of plan.screenshots.entries()) {
    const artifact = manifest.artifacts[index]
    const definition = getScreenshotDefinition(screenshotName)
    if (artifact.name !== screenshotName) {
      throw new Error(`Publication manifest artifact ${index + 1} is ${artifact.name}, expected ${screenshotName}`)
    }

    assertPublishedImage(manifest, artifact.name, 'notificationImage', artifact.notificationImage, {
      width: definition.notificationImage.width,
      height: definition.notificationImage.height,
    })
    assertPublishedImage(manifest, artifact.name, 'originalImage', artifact.originalImage, {
      width: definition.viewport.width * definition.viewport.deviceScaleFactor,
      height: definition.viewport.height * definition.viewport.deviceScaleFactor,
    })
  }

  return manifest
}

export async function writePublicationManifest(value, filename = defaultPublicationManifestFilename) {
  return writeManifestFile({ filename, value, validate: validatePublicationManifest })
}

export async function readPublicationManifest(filename = defaultPublicationManifestFilename) {
  return readManifestFile({ filename, validate: validatePublicationManifest })
}

export function getPublishedArtifact(manifest, name) {
  const artifact = manifest.artifacts.find((candidate) => candidate.name === name)
  if (!artifact) {
    throw new Error(`Publication manifest does not contain artifact: ${name}`)
  }
  return artifact
}

export function assertPublicationManifestMatchesRun(publicationValue, runValue) {
  const publicationManifest = validatePublicationManifest(publicationValue)
  const runManifest = validateRunManifest(runValue)

  if (publicationManifest.runManifestVersion !== runManifest.version) {
    throw new Error(
      `Publication manifest Run Manifest version ${publicationManifest.runManifestVersion} does not match ${runManifest.version}`
    )
  }
  if (publicationManifest.profile !== runManifest.profile) {
    throw new Error(
      `Publication manifest profile ${publicationManifest.profile} does not match ${runManifest.profile}`
    )
  }
  if (publicationManifest.renderTime !== runManifest.renderTime) {
    throw new Error(
      `Publication manifest render time ${publicationManifest.renderTime} does not match ${runManifest.renderTime}`
    )
  }
  if (publicationManifest.timeZone !== runManifest.timeZone) {
    throw new Error(
      `Publication manifest time zone ${publicationManifest.timeZone} does not match ${runManifest.timeZone}`
    )
  }
  if (publicationManifest.snapshotManifestSha256 !== runManifest.snapshot.manifestSha256) {
    throw new Error('Publication manifest Data Snapshot Manifest does not match Run Manifest')
  }

  for (const [index, runArtifact] of runManifest.artifacts.entries()) {
    const publishedArtifact = publicationManifest.artifacts[index]
    if (
      publishedArtifact.name !== runArtifact.name ||
      publishedArtifact.originalImage.bytes !== runArtifact.bytes ||
      publishedArtifact.originalImage.sha256 !== runArtifact.sha256
    ) {
      throw new Error(`Publication manifest original image does not match Run Manifest artifact: ${runArtifact.name}`)
    }
  }

  return publicationManifest
}
