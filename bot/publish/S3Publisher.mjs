import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { getScreenshotDefinition, resolveRunPlan } from '../run/RunPlan.mjs'
import { readRunManifest } from '../run/RunManifest.mjs'
import { brandingIconRelativeKey, prepareBrandingIcons } from './BrandingAssets.mjs'
import {
  objectKey,
  parseS3Configuration,
  publicAssetBaseUrl,
  publicObjectUrl,
} from './S3Configuration.mjs'
import { publicationImageRelativeKey, writePublicationManifest } from './PublicationManifest.mjs'
import { listPlatformImageVariantDefinitions } from './PublicationImageVariants.mjs'

const immutableAssetCacheControl = 'public, max-age=31536000, immutable'

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function publishedImageManifest({ buffer: _buffer, ...manifest }) {
  return manifest
}

async function verifyArtifactFile(artifact, screenshotDirectory) {
  const definition = getScreenshotDefinition(artifact.name)
  const filename = path.join(screenshotDirectory, definition.outputFilename)
  let buffer

  try {
    buffer = await fs.readFile(filename)
  } catch (error) {
    throw new Error(`Required screenshot artifact is missing: ${filename}`, { cause: error })
  }

  if (buffer.byteLength !== artifact.bytes) {
    throw new Error(
      `Screenshot artifact ${artifact.name} has ${buffer.byteLength} bytes, expected ${artifact.bytes}`
    )
  }

  if (sha256(buffer) !== artifact.sha256) {
    throw new Error(`Screenshot artifact ${artifact.name} failed SHA-256 verification`)
  }

  const metadata = await sharp(buffer, { failOn: 'warning' }).metadata()
  const expectedWidth = artifact.width
  const expectedHeight = artifact.height
  if (metadata.format !== 'png' || metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    throw new Error(
      `Screenshot artifact ${artifact.name} is ${metadata.width || 0}x${metadata.height || 0} ${metadata.format || 'unknown'}, expected ${expectedWidth}x${expectedHeight} PNG`
    )
  }

  return { artifact, buffer, definition, originalWidth: metadata.width, originalHeight: metadata.height }
}

async function encodePng(buffer, { dimensions, resize, palette }) {
  let image = sharp(buffer, { failOn: 'warning' })
  if (resize) {
    image = image.resize({
      width: dimensions.width,
      height: dimensions.height,
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
  }
  return image
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
      effort: 10,
      ...(palette === undefined ? {} : { palette }),
      ...(palette ? { colours: 256, dither: 0.75 } : {}),
    })
    .toBuffer()
}

async function createImageVariant(buffer, { dimensions, label, resize = false }) {
  const imageBuffer = await encodePng(buffer, { dimensions, resize })
  const metadata = await sharp(imageBuffer).metadata()

  if (
    metadata.format !== 'png' ||
    metadata.width !== dimensions.width ||
    metadata.height !== dimensions.height
  ) {
    throw new Error(
      `Generated ${label} is ${metadata.width || 0}x${metadata.height || 0} ${metadata.format || 'unknown'}, expected ${dimensions.width}x${dimensions.height} PNG`
    )
  }
  return imageBuffer
}

async function createPlatformImageVariants(buffer) {
  const losslessBuffers = new Map()
  const entries = await Promise.all(
    listPlatformImageVariantDefinitions().map(async (imageDefinition) => {
      const dimensionsKey = `${imageDefinition.dimensions.width}x${imageDefinition.dimensions.height}`
      if (!losslessBuffers.has(dimensionsKey)) {
        losslessBuffers.set(
          dimensionsKey,
          encodePng(buffer, {
            dimensions: imageDefinition.dimensions,
            resize: true,
            palette: false,
          })
        )
      }

      let imageBuffer = await losslessBuffers.get(dimensionsKey)
      if (
        imageDefinition.paletteFallback &&
        imageBuffer.byteLength > imageDefinition.maximumBytes
      ) {
        imageBuffer = await encodePng(buffer, {
          dimensions: imageDefinition.dimensions,
          resize: true,
          palette: true,
        })
      }
      const metadata = await sharp(imageBuffer).metadata()
      if (
        metadata.format !== 'png' ||
        metadata.width !== imageDefinition.dimensions.width ||
        metadata.height !== imageDefinition.dimensions.height
      ) {
        throw new Error(
          `Generated ${imageDefinition.name} image is ${metadata.width || 0}x${metadata.height || 0} ${metadata.format || 'unknown'}, expected ${imageDefinition.dimensions.width}x${imageDefinition.dimensions.height} PNG`
        )
      }
      if (imageBuffer.byteLength > imageDefinition.maximumBytes) {
        throw new Error(
          `Generated ${imageDefinition.name} image exceeds the ${imageDefinition.maximumBytesLabel} limit`
        )
      }
      return [imageDefinition.name, { definition: imageDefinition, buffer: imageBuffer }]
    })
  )
  return Object.fromEntries(entries)
}

function createS3Client(configuration) {
  return new S3Client({
    region: configuration.region,
    endpoint: configuration.endpoint,
    forcePathStyle: configuration.forcePathStyle,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
      ...(configuration.sessionToken ? { sessionToken: configuration.sessionToken } : {}),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

function uploadObject(client, configuration, { key, buffer, sourceSha256 }) {
  const digest = sha256(buffer)
  return client.send(
    new PutObjectCommand({
      Bucket: configuration.bucket,
      Key: key,
      Body: buffer,
      ContentLength: buffer.byteLength,
      ContentType: 'image/png',
      CacheControl: immutableAssetCacheControl,
      ContentDisposition: 'inline',
      Metadata: {
        sha256: digest,
        ...(sourceSha256 && { 'source-sha256': sourceSha256 }),
      },
    })
  )
}

async function objectMatches(client, configuration, asset) {
  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: configuration.bucket,
        Key: asset.key,
      })
    )
    return (
      response.ContentLength === asset.buffer.byteLength &&
      response.ContentType === 'image/png' &&
      response.Metadata?.sha256 === asset.sha256
    )
  } catch (error) {
    if (
      error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.name === 'AccessDenied' ||
      [403, 404].includes(error.$metadata?.httpStatusCode)
    ) {
      return false
    }
    throw new Error(`Failed to inspect S3 branding object ${asset.key}`, { cause: error })
  }
}

async function ensureBrandingObject(client, configuration, asset) {
  if (await objectMatches(client, configuration, asset)) {
    return
  }
  await uploadObject(client, configuration, asset)
}

export async function publishToS3({
  selection,
  configuration = parseS3Configuration(),
  screenshotDirectory = path.join(process.cwd(), 'screenshots'),
  client,
  publicationManifestFilename = path.join(screenshotDirectory, 'publication-manifest.json'),
} = {}) {
  const plan = resolveRunPlan(selection)
  const runManifest = await readRunManifest(path.join(screenshotDirectory, 'run-manifest.json'))
  if (runManifest.selection.join(',') !== plan.selection.join(',')) {
    throw new Error(
      `Run manifest selection ${runManifest.selection.join(',')} does not match ${plan.selection.join(',')}`
    )
  }

  const verifiedArtifacts = await Promise.all(
    runManifest.artifacts.map((artifact) => verifyArtifactFile(artifact, screenshotDirectory))
  )
  const preparedArtifacts = await Promise.all(
    verifiedArtifacts.map(async ({ artifact, buffer, definition, originalWidth, originalHeight }) => {
      const notificationBuffer = await createImageVariant(buffer, {
        dimensions: { width: originalWidth, height: originalHeight },
        label: 'notification image',
      })
      const platformImageVariants = await createPlatformImageVariants(buffer)
      const platformImages = Object.fromEntries(
        Object.entries(platformImageVariants).map(
          ([platformName, { definition: imageDefinition, buffer: platformBuffer }]) => {
            const platformSha256 = sha256(platformBuffer)
            const platformImageKey = objectKey(
              configuration,
              publicationImageRelativeKey(
                imageDefinition.name,
                platformSha256,
                definition.outputFilename
              )
            )
            return [
              platformName,
              {
                buffer: platformBuffer,
                key: platformImageKey,
                url: publicObjectUrl(configuration, platformImageKey),
                width: imageDefinition.dimensions.width,
                height: imageDefinition.dimensions.height,
                bytes: platformBuffer.byteLength,
                sha256: platformSha256,
              },
            ]
          }
        )
      )
      const notificationSha256 = sha256(notificationBuffer)
      const notificationImageKey = objectKey(
        configuration,
        publicationImageRelativeKey('notificationImage', notificationSha256, definition.outputFilename)
      )
      const originalImageKey = objectKey(
        configuration,
        publicationImageRelativeKey('originalImage', artifact.sha256, definition.outputFilename)
      )
      return {
        name: artifact.name,
        notificationImage: {
          buffer: notificationBuffer,
          key: notificationImageKey,
          url: publicObjectUrl(configuration, notificationImageKey),
          width: originalWidth,
          height: originalHeight,
          bytes: notificationBuffer.byteLength,
          sha256: notificationSha256,
        },
        platformImages,
        originalImage: {
          buffer,
          key: originalImageKey,
          url: publicObjectUrl(configuration, originalImageKey),
          width: originalWidth,
          height: originalHeight,
          bytes: buffer.byteLength,
          sha256: artifact.sha256,
        },
      }
    })
  )
  const preparedBrandingIcons = await Promise.all(
    (await prepareBrandingIcons()).map(async (icon) => {
      const relativeKey = brandingIconRelativeKey(icon.sha256, icon.outputFilename)
      const key = objectKey(configuration, relativeKey)
      return {
        ...icon,
        key,
        url: publicObjectUrl(configuration, key),
      }
    })
  )

  const ownsClient = !client
  const s3Client = client || createS3Client(configuration)
  try {
    await Promise.all([
      ...preparedArtifacts.flatMap(({ notificationImage, platformImages, originalImage }) => [
        uploadObject(s3Client, configuration, {
          key: originalImage.key,
          buffer: originalImage.buffer,
        }),
        uploadObject(s3Client, configuration, {
          key: notificationImage.key,
          buffer: notificationImage.buffer,
          sourceSha256: originalImage.sha256,
        }),
        ...Object.values(platformImages).map((platformImage) =>
          uploadObject(s3Client, configuration, {
            key: platformImage.key,
            buffer: platformImage.buffer,
            sourceSha256: originalImage.sha256,
          })
        ),
      ]),
      ...preparedBrandingIcons.map((icon) => ensureBrandingObject(s3Client, configuration, icon)),
    ])
  } finally {
    if (ownsClient) {
      s3Client.destroy()
    }
  }

  return writePublicationManifest(
    {
      version: 7,
      runManifestVersion: runManifest.version,
      selection: plan.selection,
      renderTime: runManifest.renderTime,
      timeZone: runManifest.timeZone,
      locale: runManifest.locale,
      resolution: runManifest.resolution,
      screenshotAttribution: runManifest.screenshotAttribution,
      snapshotManifestSha256: runManifest.snapshot.manifestSha256,
      assetBaseUrl: publicAssetBaseUrl(configuration),
      branding: {
        icons: Object.fromEntries(
          preparedBrandingIcons.map(
            ({ name, buffer: _buffer, sourceFilename: _sourceFilename, outputFilename: _outputFilename, ...icon }) => [
              name,
              icon,
            ]
          )
        ),
      },
      artifacts: preparedArtifacts.map(({ name, notificationImage, platformImages, originalImage }) => ({
        name,
        notificationImage: publishedImageManifest(notificationImage),
        platformImages: Object.fromEntries(
          Object.entries(platformImages).map(([platformName, image]) => [
            platformName,
            publishedImageManifest(image),
          ])
        ),
        originalImage: publishedImageManifest(originalImage),
      })),
    },
    publicationManifestFilename
  )
}
