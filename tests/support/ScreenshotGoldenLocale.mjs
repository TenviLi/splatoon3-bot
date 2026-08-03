import path from 'node:path'

export const screenshotGoldenLocales = Object.freeze(
  ['en-US', 'zh-CN', 'ja-JP'].map((locale) => Object.freeze({ locale }))
)

function requireScreenshotGoldenLocale(locale) {
  if (!screenshotGoldenLocales.some((candidate) => candidate.locale === locale)) {
    throw new Error(`Unknown screenshot golden locale: ${locale}`)
  }
  return locale
}

export function screenshotGoldenFilename(screenshotName) {
  return `${screenshotName}.png`
}

export function screenshotGoldenPath(rootDirectory, screenshotName, locale) {
  return path.join(
    rootDirectory,
    requireScreenshotGoldenLocale(locale),
    screenshotGoldenFilename(screenshotName)
  )
}
