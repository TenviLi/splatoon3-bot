import { getRunPlan, getScreenshotDefinition } from '../../bot/run/RunPlan.mjs'

export function createPublicationManifestFixture(
  profile = 'all',
  { assetBaseUrl = 'https://cdn.example.com', brandingBaseUrl = assetBaseUrl } = {}
) {
  const normalizedAssetBaseUrl = assetBaseUrl.replace(/\/$/, '')
  const normalizedBrandingBaseUrl = brandingBaseUrl.replace(/\/$/, '')
  const plan = getRunPlan(profile)
  const notificationSha256 = 'a'.repeat(64)
  const originalSha256 = 'b'.repeat(64)
  return {
    version: 2,
    runManifestVersion: 3,
    profile,
    renderTime: Date.parse('2026-07-29T19:00:00Z'),
    timeZone: 'Asia/Shanghai',
    screenshotAttribution: 'splatoon3.ink',
    snapshotManifestSha256: '80c31540131253c528fb04b0fea9f86b0679b04b9f3a072618d019191bf93452',
    assetBaseUrl: normalizedAssetBaseUrl,
    branding: {
      icons: {
        schedules: `${normalizedBrandingBaseUrl}/icon.png`,
        salmonRun: `${normalizedBrandingBaseUrl}/icon2.png`,
        gear: `${normalizedBrandingBaseUrl}/icon3.png`,
      },
    },
    artifacts: plan.screenshots.map((name) => {
      const definition = getScreenshotDefinition(name)
      const originalWidth = definition.viewport.width * definition.viewport.deviceScaleFactor
      const originalHeight = definition.viewport.height * definition.viewport.deviceScaleFactor
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
          width: originalWidth,
          height: originalHeight,
          bytes: 1_600_000,
          sha256: originalSha256,
        },
      }
    }),
  }
}
