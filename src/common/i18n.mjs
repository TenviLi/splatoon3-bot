import { createI18n } from 'vue-i18n'
import botMessages from './botMessages.mjs'
import {
  botLocaleDefinitions,
  defaultBotLocale,
  defineBotLocaleMap,
  normalizeBotLocale,
} from './botLocale.mjs'

export const locales = botLocaleDefinitions
export const defaultLocale = locales.find((locale) => locale.code === defaultBotLocale)
const fallbackLocale = 'en-US'

function indexLocaleLoaders(modules, label) {
  const localeLoaders = Object.fromEntries(
    Object.entries(modules).map(([modulePath, loader]) => {
      const locale = modulePath.match(/\/([^/]+)\.json$/u)?.[1]
      if (!locale) {
        throw new Error(`${label} contains an invalid locale module path: ${modulePath}`)
      }
      return [locale, loader]
    })
  )
  return defineBotLocaleMap(localeLoaders, label)
}

const applicationMessageLoaders = indexLocaleLoaders(
  import.meta.glob('../assets/i18n/*.json', { import: 'default' }),
  'Application message loaders'
)
const splatnetMessageLoaders = indexLocaleLoaders(
  import.meta.glob('@data/locale/*.json', { import: 'default' }),
  'SplatNet message loaders'
)

const datetimeFormats = Object.freeze({
  dateTimeShort: { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  dateTimeShortWeekday: { month: 'numeric', weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  time: { hour: 'numeric', minute: '2-digit' },
})

let i18n = null
let initialization = null

async function loadMessages(locale) {
  const [applicationMessages, splatnetMessages] = await Promise.all([
    applicationMessageLoaders[locale](),
    splatnetMessageLoaders[locale](),
  ])
  return Object.freeze({
    ...applicationMessages,
    ...botMessages[locale],
    splatnet: splatnetMessages,
  })
}

export function initializeI18n() {
  if (!initialization) {
    initialization = (async () => {
      const locale = normalizeBotLocale(localStorage.getItem('lang'))
      const [messages, fallbackMessages] = await Promise.all([
        loadMessages(locale),
        locale === fallbackLocale ? Promise.resolve(null) : loadMessages(fallbackLocale),
      ])
      i18n = createI18n({
        legacy: false,
        locale,
        fallbackLocale,
        messages: {
          [locale]: messages,
          ...(fallbackMessages ? { [fallbackLocale]: fallbackMessages } : {}),
        },
        datetimeFormats: Object.fromEntries(locales.map(({ code }) => [code, datetimeFormats])),
      })
      applyLocale(locale)
      return i18n
    })()
  }
  return initialization
}

export async function setPreferredLocale(value) {
  const locale = normalizeBotLocale(value)
  localStorage.setItem('lang', locale)
  const instance = await initializeI18n()
  if (!instance.global.availableLocales.includes(locale)) {
    instance.global.setLocaleMessage(locale, await loadMessages(locale))
  }
  if (normalizeBotLocale(localStorage.getItem('lang')) === locale) {
    applyLocale(locale)
  }
  return locale
}

function applyLocale(locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale

  switch (locale) {
    case 'zh-CN':
    case 'zh-TW':
      document.documentElement.style.setProperty('--font-family-s1', 'splatoon1, splatoon1chzh, sans-serif')
      document.documentElement.style.setProperty('--font-family-s2', 'splatoon2, splatoon2chzh, sans-serif')
      break

    default:
      document.documentElement.style.setProperty('--font-family-s1', 'splatoon1, splatoon1jpja, sans-serif')
      document.documentElement.style.setProperty('--font-family-s2', 'splatoon2, splatoon2jpja, sans-serif')
      break
  }
}
