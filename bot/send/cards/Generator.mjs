import fs from 'fs/promises'
import path from 'path'
import { createPinia, setActivePinia } from 'pinia'
import { useFestivalsDataStore, useGearDataStore, useSchedulesDataStore } from '../../../src/stores/data.mjs'
import { useTimeStore } from '../../../src/stores/time.mjs'
import prefixedConsole from '../../common/prefixedConsole.mjs'
import { getTopOfCurrentHour } from '../../common/util.mjs'
import zhCN from '../../../src/assets/i18n/zh-CN.json' assert { type: 'json' }
import localeCN from '../../../data/locale/zh-CN.json' assert { type: 'json' }

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { ...zhCN, splatnet: localeCN },
  },
  datetimeFormats: {
    'zh-CN': {
      dateTimeShort: { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' },
      dateTimeShortWeekday: { month: 'numeric', weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
      time: { hour: 'numeric', minute: '2-digit' },
    },
  },
}).global
export const $t = i18n.t
export const $d = i18n.d

export default class WxWorkGenerator {
  name = null
  key = null

  /** @type {Console} */
  get console() {
    this._console ??= prefixedConsole('WxWork', this.name)

    return this._console
  }

  async preparePinia() {
    if (this._piniaInitialized) {
      return
    }

    setActivePinia(createPinia())

    useTimeStore().setNow(getTopOfCurrentHour())

    useSchedulesDataStore().setData(JSON.parse(await fs.readFile(path.join(process.cwd(), 'data/schedules.json'))))
    useGearDataStore().setData(JSON.parse(await fs.readFile(path.join(process.cwd(), 'data/gear.json'))))
    useFestivalsDataStore().setData(JSON.parse(await fs.readFile(path.join(process.cwd(), 'data/festivals.json'))))

    this._piniaInitialized = true
  }

  /**
   * @param {WxWorkClient} wxworkClient
   */
  async sendMessage(wxworkClient) {
    const message = await this.getMessage()

    await wxworkClient.send(message)
  }

  async getMessage() {}
}
