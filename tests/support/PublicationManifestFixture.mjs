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
  const originalSha256 = 'b'.repeat(64)
  return {
    version: 3,
    runManifestVersion: 4,
    profile,
    renderTime: Date.parse('2026-07-29T19:00:00Z'),
    timeZone: 'Asia/Shanghai',
    locale,
    resolution,
    screenshotAttribution: 'splatoon3.ink',
    snapshotManifestSha256: '00809cd566248534814327ea99c831bcf3b0c8096537805181e234b0218c1e17',
    assetBaseUrl: normalizedAssetBaseUrl,
    branding: {
      icons: Object.fromEntries(
        listBrandingIconDefinitions().map(({ name, outputFilename }, index) => {
          const sha256 = String.fromCharCode('c'.charCodeAt(0) + index).repeat(64)
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
          width: definition.notificationImage.width,
          height: definition.notificationImage.height,
          bytes: 800_000,
          sha256: notificationSha256,
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
