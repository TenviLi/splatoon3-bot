const defaultFontFamilies = Object.freeze({
  s1: 'splatoon1, splatoon1jpja, sans-serif',
  s2: 'splatoon2, splatoon2jpja, sans-serif',
})

const localeFontFamilies = Object.freeze({
  'zh-CN': Object.freeze({
    s1: 'splatoon1, splatoon1chzh, sans-serif',
    s2: 'splatoon2, splatoon2chzh, sans-serif',
  }),
  'zh-TW': Object.freeze({
    s1: 'splatoon1, splatoon1twzh, sans-serif',
    s2: 'splatoon2, splatoon2twzh, sans-serif',
  }),
})

export function getLocaleFontFamilies(locale) {
  return localeFontFamilies[locale] || defaultFontFamilies
}
