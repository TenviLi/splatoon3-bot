import { getScreenshotResolution } from '../../bot/config/ScreenshotResolution.mjs'
import { listBrandingIconDefinitions } from '../../bot/publish/BrandingAssets.mjs'
import { getRunPlan, getScreenshotDefinition } from '../../bot/run/RunPlan.mjs'

export function createPublicationManifestFixture(
  profile = 'all',
  { assetBaseUrl = 'https://cdn.example.com', locale = 'zh-CN', resolution = '2400x1350' } = {}
) {
  const normalizedAssetBaseUrl = assetBaseUrl.replace(/\/$/, '')
  const plan = getRunPlan(profile)
  const originalDimensions = getScreenshotResolution(resolution)
  const notificationSha256 = 'a'.repeat(64)
  const compactSha256 = 'b'.repeat(64)
  const originalSha256 = 'c'.repeat(64)
  return {
    version: 4,
    runManifestVersion: 4,
    profile,
    renderTime: Date.parse('2026-07-29T19:00:00Z'),
    timeZone: 'Asia/Shanghai',
    locale,
    resolution,
    screenshotAttribution: 'splatoon3.ink',
    snapshotManifestSha256: '7e86d01f7d7d1f4731720eded67e95d46a46b3031fadf023fa2347d702bfaf2c',
    assetBaseUrl: normalizedAssetBaseUrl,
    branding: {
      icons: Object.fromEntries(
        listBrandingIconDefinitions().map(({ name, outputFilename }, index) => {
          const sha256 = String.fromCharCode('d'.charCodeAt(0) + index).repeat(64)
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
        compactImage: {
          key: `compact-images/${compactSha256}/${definition.outputFilename}`,
          url: `${normalizedAssetBaseUrl}/compact-images/${compactSha256}/${definition.outputFilename}`,
          width: definition.compactImage.width,
          height: definition.compactImage.height,
          bytes: 500_000,
          sha256: compactSha256,
        },
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
