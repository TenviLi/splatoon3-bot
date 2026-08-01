export const supportedBotLocales = Object.freeze(['en-US', 'zh-CN', 'ja-JP'])
export const defaultBotLocale = 'zh-CN'

export function normalizeBotLocale(value) {
  const locale = String(value || defaultBotLocale).trim()
  if (!supportedBotLocales.includes(locale)) {
    throw new Error(`BOT_LOCALE must be one of: ${supportedBotLocales.join(', ')}`)
  }
  return locale
}
