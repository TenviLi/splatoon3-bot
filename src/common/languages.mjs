import botMessages from './botMessages.mjs'
import { defineBotLocaleMap, supportedBotLocales } from './botLocale.mjs'

const upstreamLanguages = defineBotLocaleMap(
  Object.fromEntries(
    await Promise.all(
      supportedBotLocales.map(async (locale) => {
        const module = await import(`../assets/i18n/${locale}.json`, { with: { type: 'json' } })
        return [locale, module.default]
      })
    )
  ),
  'Application messages'
)

export default defineBotLocaleMap(
  Object.fromEntries(
    Object.entries(upstreamLanguages).map(([locale, messages]) => [
      locale,
      Object.freeze({ ...messages, ...botMessages[locale] }),
    ])
  ),
  'Bot runtime languages'
)
