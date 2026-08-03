import { getScreenshotResolution } from '../../bot/config/ScreenshotResolution.mjs'
import { listBrandingIconDefinitions } from '../../bot/publish/BrandingAssets.mjs'
import { listPlatformImageVariantDefinitions } from '../../bot/publish/PublicationImageVariants.mjs'
import { getScreenshotDefinition, resolveRunPlan } from '../../bot/run/RunPlan.mjs'

export function createPublicationManifestFixture(
  selection = ['schedules', 'salmon-run', 'gear-dailydrop', 'gear-regular', 'gear-salmon-run'],
  { assetBaseUrl = 'https://cdn.example.com', locale = 'zh-CN', resolution = '2400x1350' } = {}
) {
  const normalizedAssetBaseUrl = assetBaseUrl.replace(/\/$/, '')
  const plan = resolveRunPlan(selection)
  const originalDimensions = getScreenshotResolution(resolution)
  const notificationSha256 = 'a'.repeat(64)
  const originalSha256 = 'c'.repeat(64)
  return {
    version: 8,
    runManifestVersion: 6,
    selection: plan.selection,
    renderTime: Date.parse('2026-07-29T19:00:00Z'),
    timeZone: 'Asia/Shanghai',
    locale,
    resolution,
    screenshotAttribution: 'splatoon3.ink',
    snapshotManifestSha256: 'd7c5a5e88d82efed986c8977764d5cab034235badf6896726e840ca0a22f9b50',
    assetBaseUrl: normalizedAssetBaseUrl,
    branding: {
      icons: Object.fromEntries(
        listBrandingIconDefinitions().map(({ name, outputFilename }, index) => {
          const sha256 = ['d', 'e', 'f', '0', '1'][index].repeat(64)
          const key = `branding-icons/${sha256}/${outputFilename}`
          return [
            name,
            {
              key,
              url: `${normalizedAssetBaseUrl}/${key}`,
              width: 256,
              height: 256,
              bytes: 10_000,
              sha256,
            },
          ]
        })
      ),
    },
    artifacts: plan.screenshots.map((name) => {
      const definition = getScreenshotDefinition(name)
      return {
        name,
        notificationImage: {
          key: `notification-images/${notificationSha256}/${definition.outputFilename}`,
          url: `${normalizedAssetBaseUrl}/notification-images/${notificationSha256}/${definition.outputFilename}`,
          width: originalDimensions.width,
          height: originalDimensions.height,
          bytes: 800_000,
          sha256: notificationSha256,
        },
        platformImages: Object.fromEntries(
          listPlatformImageVariantDefinitions().map((imageDefinition, index) => {
            const sha256 = String.fromCharCode('b'.charCodeAt(0) + index).repeat(64)
            const key = `${imageDefinition.directory}/${sha256}/${definition.outputFilename}`
            return [
              imageDefinition.name,
              {
                key,
                url: `${normalizedAssetBaseUrl}/${key}`,
                width: imageDefinition.dimensions.width,
                height: imageDefinition.dimensions.height,
                bytes: 500_000,
                sha256,
              },
            ]
          })
        ),
        originalImage: {
          key: `originals/${originalSha256}/${definition.outputFilename}`,
          url: `${normalizedAssetBaseUrl}/originals/${originalSha256}/${definition.outputFilename}`,
          width: originalDimensions.width,
          height: originalDimensions.height,
          bytes: 1_600_000,
          sha256: originalSha256,
        },
      }
    }),
  }
}
