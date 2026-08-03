import path from 'node:path'
import { z } from 'zod'
import { absoluteUrlSchema } from '../config/AbsoluteUrl.mjs'
import { botLocaleSchema } from '../config/BotLocale.mjs'
import { botTimeZoneSchema } from '../config/BotTimeZone.mjs'
import { screenshotAttributionSchema } from '../config/ScreenshotAttribution.mjs'
import { getScreenshotResolution, screenshotResolutionSchema } from '../config/ScreenshotResolution.mjs'
import { readManifestFile, writeManifestFile } from '../manifest/ManifestFile.mjs'
import { getScreenshotDefinition, resolveRunPlan } from '../run/RunPlan.mjs'
import { validateRunManifest } from '../run/RunManifest.mjs'
import {
  brandingIconDimensions,
  brandingIconRelativeKey,
  listBrandingIconDefinitions,
} from './BrandingAssets.mjs'
import {
  getPublicationImageVariantDefinition,
  listPlatformImageVariantDefinitions,
} from './PublicationImageVariants.mjs'

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
    platformImages: z
      .object(
        Object.fromEntries(
          listPlatformImageVariantDefinitions().map(({ name }) => [name, publishedImageSchema])
        )
      )
      .strict(),
    originalImage: publishedImageSchema,
  })
  .strict()

const brandingManifestSchema = z
  .object({
    icons: z
      .object(
        Object.fromEntries(listBrandingIconDefinitions().map(({ name }) => [name, publishedImageSchema]))
      )
      .strict(),
  })
  .strict()

const publicationManifestSchema = z
  .object({
    version: z.literal(8),
    runManifestVersion: z.literal(6),
    selection: z.array(z.string().min(1)).min(1),
    renderTime: z.number().int().nonnegative(),
    timeZone: botTimeZoneSchema,
    locale: botLocaleSchema,
    resolution: screenshotResolutionSchema,
    screenshotAttribution: screenshotAttributionSchema,
    snapshotManifestSha256: sha256Schema,
    assetBaseUrl: absoluteUrlSchema({ label: 'assetBaseUrl' }),
    branding: brandingManifestSchema,
    artifacts: z.array(publishedArtifactSchema),
  })
  .strict()

export const defaultPublicationManifestFilename = path.join('screenshots', 'publication-manifest.json')

export function publicationImageRelativeKey(variant, sha256, outputFilename) {
  const directory = getPublicationImageVariantDefinition(variant).directory
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

function assertPublishedImage(
  manifest,
  label,
  image,
  expectedSuffix,
  expectedDimensions,
  maximumBytes,
  maximumBytesLabel
) {
  if (image.key !== expectedSuffix && !image.key.endsWith(`/${expectedSuffix}`)) {
    throw new Error(`Publication ${label} key must end with ${expectedSuffix}`)
  }

  const baseUrl = new URL(manifest.assetBaseUrl)
  const imageUrl = new URL(image.url)
  const basePath = decodedPathname(baseUrl, 'assetBaseUrl').replace(/\/+$/, '')
  const imagePath = decodedPathname(imageUrl, `Publication ${label} URL`)
  const basePrefix = `${basePath}/`.replace(/^\/\//, '/')
  if (imageUrl.origin !== baseUrl.origin || !imagePath.startsWith(basePrefix)) {
    throw new Error(`Publication ${label} URL must be below assetBaseUrl`)
  }
  const expectedUrl = contentAddressedUrl(baseUrl, expectedSuffix)
  if (imageUrl.href !== expectedUrl.href) {
    throw new Error(
      `Publication ${label} URL must exactly match assetBaseUrl plus ${expectedSuffix}`
    )
  }

  if (image.width !== expectedDimensions.width || image.height !== expectedDimensions.height) {
    throw new Error(
      `Publication ${label} is ${image.width}x${image.height}, expected ${expectedDimensions.width}x${expectedDimensions.height}`
    )
  }
  if (maximumBytes && image.bytes > maximumBytes) {
    throw new Error(
      `Publication ${label} exceeds the ${maximumBytesLabel || `${maximumBytes} byte`} limit`
    )
  }
}

export function validatePublicationManifest(value) {
  const manifest = publicationManifestSchema.parse(value)
  const plan = resolveRunPlan(manifest.selection)
  const resolution = getScreenshotResolution(manifest.resolution)

  if (manifest.selection.join(',') !== plan.selection.join(',')) {
    throw new Error(`Publication manifest selection must use canonical order: ${plan.selection.join(',')}`)
  }

  for (const definition of listBrandingIconDefinitions()) {
    const icon = manifest.branding.icons[definition.name]
    assertPublishedImage(
      manifest,
      `branding icon ${definition.name}`,
      icon,
      brandingIconRelativeKey(icon.sha256, definition.outputFilename),
      brandingIconDimensions
    )
  }

  if (manifest.artifacts.length !== plan.screenshots.length) {
    throw new Error(
      `Publication manifest for ${plan.label} contains ${manifest.artifacts.length} artifacts, expected ${plan.screenshots.length}`
    )
  }

  for (const [index, screenshotName] of plan.screenshots.entries()) {
    const artifact = manifest.artifacts[index]
    const definition = getScreenshotDefinition(screenshotName)
    if (artifact.name !== screenshotName) {
      throw new Error(`Publication manifest artifact ${index + 1} is ${artifact.name}, expected ${screenshotName}`)
    }

    assertPublishedImage(
      manifest,
      `notificationImage for ${artifact.name}`,
      artifact.notificationImage,
      publicationImageRelativeKey('notificationImage', artifact.notificationImage.sha256, definition.outputFilename),
      resolution
    )
    for (const imageDefinition of listPlatformImageVariantDefinitions()) {
      const image = artifact.platformImages[imageDefinition.name]
      assertPublishedImage(
        manifest,
        `${imageDefinition.name} image for ${artifact.name}`,
        image,
        publicationImageRelativeKey(imageDefinition.name, image.sha256, definition.outputFilename),
        imageDefinition.dimensions,
        imageDefinition.maximumBytes,
        imageDefinition.maximumBytesLabel
      )
    }
    assertPublishedImage(
      manifest,
      `originalImage for ${artifact.name}`,
      artifact.originalImage,
      publicationImageRelativeKey('originalImage', artifact.originalImage.sha256, definition.outputFilename),
      resolution
    )
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
  if (publicationManifest.selection.join(',') !== runManifest.selection.join(',')) {
    throw new Error(
      `Publication manifest selection ${publicationManifest.selection.join(',')} does not match ${runManifest.selection.join(',')}`
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
  if (publicationManifest.locale !== runManifest.locale) {
    throw new Error(
      `Publication manifest locale ${publicationManifest.locale} does not match ${runManifest.locale}`
    )
  }
  if (publicationManifest.resolution !== runManifest.resolution) {
    throw new Error(
      `Publication manifest resolution ${publicationManifest.resolution} does not match ${runManifest.resolution}`
    )
  }
  if (publicationManifest.screenshotAttribution !== runManifest.screenshotAttribution) {
    throw new Error(
      `Publication manifest screenshot attribution ${publicationManifest.screenshotAttribution} does not match ${runManifest.screenshotAttribution}`
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
