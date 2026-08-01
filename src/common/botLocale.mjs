export const botLocaleDefinitions = Object.freeze(
  [
    ['de-DE', '🇩🇪', 'Deutsch'],
    ['en-GB', '🇬🇧', 'English (UK)'],
    ['en-US', '🇺🇸', 'English (US)'],
    ['es-ES', '🇪🇸', 'Español (España)'],
    ['es-MX', '🇲🇽', 'Español (México)'],
    ['fr-CA', '🇨🇦', 'Français (Canada)'],
    ['fr-FR', '🇫🇷', 'Français (France)'],
    ['it-IT', '🇮🇹', 'Italiano'],
    ['ja-JP', '🇯🇵', '日本語'],
    ['ko-KR', '🇰🇷', '한국어'],
    ['nl-NL', '🇳🇱', 'Nederlands'],
    ['ru-RU', '🇷🇺', 'Русский'],
    ['zh-CN', '🇨🇳', '简体中文'],
    ['zh-TW', '🇹🇼', '繁體中文'],
  ].map(([code, flag, name]) => Object.freeze({ code, flag, name }))
)
export const supportedBotLocales = Object.freeze(botLocaleDefinitions.map(({ code }) => code))
export const defaultBotLocale = 'zh-CN'

export function defineBotLocaleMap(localeMap, label = 'Bot locale map') {
  const localeEntries = Object.entries(localeMap)
  const providedLocales = new Set(localeEntries.map(([locale]) => locale))
  const missingLocales = supportedBotLocales.filter((locale) => !providedLocales.has(locale))
  const unsupportedLocales = localeEntries
    .map(([locale]) => locale)
    .filter((locale) => !supportedBotLocales.includes(locale))

  if (missingLocales.length > 0 || unsupportedLocales.length > 0) {
    const details = [
      missingLocales.length > 0 ? `missing ${missingLocales.join(', ')}` : null,
      unsupportedLocales.length > 0 ? `unsupported ${unsupportedLocales.join(', ')}` : null,
    ].filter(Boolean)
    throw new Error(`${label} must match supported Bot locales: ${details.join('; ')}`)
  }

  return Object.freeze(
    Object.fromEntries(supportedBotLocales.map((locale) => [locale, localeMap[locale]]))
  )
}

export function normalizeBotLocale(value) {
  const locale = String(value || defaultBotLocale).trim()
  if (!supportedBotLocales.includes(locale)) {
    throw new Error(`BOT_LOCALE must be one of: ${supportedBotLocales.join(', ')}`)
  }
  return locale
}
