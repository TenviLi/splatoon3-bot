export const screenshotGoldenLocales = Object.freeze([
  Object.freeze({ locale: 'en-US', filenameSuffix: '' }),
  Object.freeze({ locale: 'zh-CN', filenameSuffix: '.zh-CN' }),
  Object.freeze({ locale: 'ja-JP', filenameSuffix: '.ja' }),
])

export function screenshotGoldenFilename(screenshotName, locale) {
  const definition = screenshotGoldenLocales.find((candidate) => candidate.locale === locale)
  if (!definition) {
    throw new Error(`Unknown screenshot golden locale: ${locale}`)
  }
  return `${screenshotName}${definition.filenameSuffix}.png`
}
