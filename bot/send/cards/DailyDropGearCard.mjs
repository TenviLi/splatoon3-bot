import WxWorkGenerator, { $t, $d } from './Generator.mjs'
import { useGearStore } from '../../../src/stores/gear.mjs'
import { getGearIcon } from '../../common/util.mjs'

export default class DailyDropGearCard extends WxWorkGenerator {
  name = 'Daily Drop Gear'

  async #getData() {
    await this.preparePinia()
    let brand = useGearStore().dailyDropBrand
    let gears = useGearStore().dailyDropGear

    return { brand, gears }
  }

  async getMessage() {
    const { brand, gears } = await this.#getData()

    const payload = {
      msgtype: 'template_card',
      template_card: {
        card_type: 'news_notice',
        source: {
          icon_url: `${process.env.UPYUN_DOMAIN}/icon.png!sm`,
          desc: '目前の商店贩卖',
          desc_color: 0,
        },
        main_title: {
          title: `「${$t(`splatnet.brands.${brand.brand.id}.name`, brand.brand.name)}」`,
          desc: $t('time.until', { time: $d(brand?.saleEndTime, 'dateTimeShortWeekday') }),
        },
        card_image: {
          url: `${process.env.UPYUN_DOMAIN}/gear.png!sm`,
          aspect_ratio: 1.78,
        },
        horizontal_content_list: gears.map((gear) => {
          const icon = getGearIcon(gear)
          const name = $t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)
          const power = $t(
            `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
            gear.gear.primaryGearPower.name
          )

          return {
            keyname: icon,
            value: `${name}\n  ${power}`,
          }
        }),
        card_action: {
          type: 1,
          url: `${process.env.UPYUN_DOMAIN}/gear.png!sm`,
        },
      },
    }
    return payload
  }
}
