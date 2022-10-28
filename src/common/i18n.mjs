import { createI18n } from 'vue-i18n'
import languages from '../assets/i18n/index.mjs'
import localeCN from '../../data/locale/zh-CN.json?url' assert { type: 'json' }
// import localeUS from '../../data/locale/en-US.json' assert { type: 'json' }

export const locales = [
  { code: 'en-US', flag: '🇺🇸', name: 'English (US)' },
  { code: 'zh-CN', flag: '🇨🇳', name: '中文(简体)' },
]

export const defaultLocale = locales.find((l) => l.code === 'zh-CN')

const datetimeFormats = {
  dateTimeShort: { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  dateTimeShortWeekday: { month: 'numeric', weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  time: { hour: 'numeric', minute: '2-digit' },
}

let i18n = null

export function initializeI18n() {
  if (!i18n) {
    i18n = createI18n({
      locale: defaultLocale,
      fallbackLocale: 'zh-CN',
      messages: { ...languages },
      datetimeFormats: locales.reduce((result, locale) => ({ ...result, [locale.code]: datetimeFormats }), {}),
    })
    reload()
  }

  return i18n
}

function reload() {
  i18n.global.locale.value = defaultLocale.code
  loadLocale()

  switch (defaultLocale.code) {
    case 'zh-CN':
      document.documentElement.style.setProperty('--font-family-s1', 'splatoon1, splatoon1chzh, sans-serif')
      document.documentElement.style.setProperty('--font-family-s2', 'splatoon2, splatoon2chzh, sans-serif')
      break

    default:
      document.documentElement.style.setProperty('--font-family-s1', 'splatoon1, splatoon1jpja, sans-serif')
      document.documentElement.style.setProperty('--font-family-s2', 'splatoon2, splatoon2jpja, sans-serif')
      break
  }
}

function loadLocale() {
  let locale = defaultLocale.code
  // let json = { 'en-US': localeUS, 'zh-CN': localeCN }[locale]
  let json = { 'zh-CN': localeCN }[locale]

  i18n.global.setLocaleMessage(locale, {
    ...i18n.global.getLocaleMessage(locale),
    splatnet: json,
  })
}
