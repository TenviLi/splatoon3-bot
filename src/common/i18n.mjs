import { createI18n } from 'vue-i18n'
import languages from '../assets/i18n/index.mjs'
import localeUS from '@data/locale/en-US.json' with { type: 'json' }
import localeJP from '@data/locale/ja-JP.json' with { type: 'json' }
import localeCN from '@data/locale/zh-CN.json' with { type: 'json' }
import { defaultBotLocale, normalizeBotLocale } from './botLocale.mjs'

export const locales = [
  { code: 'en-US', flag: '🇺🇸', name: 'English' },
  { code: 'zh-CN', flag: '🇨🇳', name: '中文(简体)' },
  { code: 'ja-JP', flag: '🇯🇵', name: '日本語' },
]

export const defaultLocale = locales.find((locale) => locale.code === defaultBotLocale)

const datetimeFormats = {
  dateTimeShort: { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  dateTimeShortWeekday: { month: 'numeric', weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  time: { hour: 'numeric', minute: '2-digit' },
}

let i18n = null

export function initializeI18n() {
  if (!i18n) {
    const locale = normalizeBotLocale(localStorage.getItem('lang'))
    i18n = createI18n({
      legacy: false,
      locale,
      fallbackLocale: defaultBotLocale,
      messages: { ...languages },
      datetimeFormats: locales.reduce((result, locale) => ({ ...result, [locale.code]: datetimeFormats }), {}),
    })
    reload(locale)
  }

  return i18n
}

export function setPreferredLocale(value) {
  const locale = normalizeBotLocale(value)
  localStorage.setItem('lang', locale)
  if (i18n) {
    reload(locale)
  } else {
    initializeI18n()
  }
  return locale
}

function reload(locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  loadLocale(locale)

  switch (locale) {
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

function loadLocale(locale) {
  const json = { 'en-US': localeUS, 'zh-CN': localeCN, 'ja-JP': localeJP }[locale]

  i18n.global.setLocaleMessage(locale, {
    ...i18n.global.getLocaleMessage(locale),
    splatnet: json,
  })
}
