import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createI18n } from 'vue-i18n'
import { supportedBotLocales } from '../src/common/botLocale.mjs'
import { getLocaleFontFamilies } from '../src/common/fontFamilies.mjs'
import { pluralRules, ruPluralization } from '../src/common/pluralRules.mjs'

const applicationLocaleDirectory = path.join(process.cwd(), 'src', 'assets', 'i18n')
const snapshotLocaleDirectory = path.join(process.cwd(), 'tests', 'fixtures', 'data', 'locale')

async function listJsonLocales(directory) {
  return (await fs.readdir(directory))
    .filter((filename) => filename.endsWith('.json'))
    .map((filename) => path.basename(filename, '.json'))
    .sort()
}

test('ships every canonical locale in both application and Data Snapshot registries', async () => {
  const expectedLocales = [...supportedBotLocales].sort()
  assert.deepEqual(await listJsonLocales(applicationLocaleDirectory), expectedLocales)
  assert.deepEqual(await listJsonLocales(snapshotLocaleDirectory), expectedLocales)
})

test('uses the upstream Russian pluralization contract in Vue I18n', () => {
  assert.deepEqual(Object.keys(pluralRules), ['ru-RU'])
  assert.deepEqual(
    [0, 1, 2, 4, 5, 11, 21, 22, 25].map((choice) => ruPluralization(choice, 3)),
    [2, 0, 1, 1, 2, 2, 0, 1, 2]
  )
  assert.deepEqual(
    [0, 1, 2, 4, 5, 11, 21, 22, 25].map((choice) => ruPluralization(choice, 4)),
    [0, 1, 2, 2, 3, 3, 1, 2, 3]
  )

  const i18n = createI18n({
    legacy: false,
    locale: 'ru-RU',
    fallbackLocale: 'ru-RU',
    pluralRules,
    messages: {
      'ru-RU': { hours: '{n} час | {n} часа | {n} часов' },
    },
  })
  assert.equal(i18n.global.t('hours', { n: 1 }, 1), '1 час')
  assert.equal(i18n.global.t('hours', { n: 2 }, 2), '2 часа')
  assert.equal(i18n.global.t('hours', { n: 5 }, 5), '5 часов')
  assert.equal(i18n.global.t('hours', { n: 21 }, 21), '21 час')
})

test('ships every font referenced by the complete upstream font stylesheet', async () => {
  assert.deepEqual(getLocaleFontFamilies('zh-CN'), {
    s1: 'splatoon1, splatoon1chzh, sans-serif',
    s2: 'splatoon2, splatoon2chzh, sans-serif',
  })
  assert.deepEqual(getLocaleFontFamilies('zh-TW'), {
    s1: 'splatoon1, splatoon1twzh, sans-serif',
    s2: 'splatoon2, splatoon2twzh, sans-serif',
  })

  const stylesheet = await fs.readFile(path.join(process.cwd(), 'src', 'assets', 'css', 'fonts.css'), 'utf8')
  const referencedFonts = new Set(
    [...stylesheet.matchAll(/assets\/fonts\/([^"')]+)/gu)].map((match) => match[1])
  )
  assert.match(stylesheet, /font-family:splatoon1twzh/u)
  assert.match(stylesheet, /Splatoon1KRko-level1\.woff2/u)
  assert.equal(referencedFonts.size, 48)
  for (const font of referencedFonts) {
    await fs.access(path.join(process.cwd(), 'src', 'assets', 'fonts', font))
  }
})
