import WxWorkGenerator, { $t, $d } from './Generator.mjs'
import { useGearStore } from '../../../src/stores/gear.mjs'
import { formatShortDurationFromNow } from '../../../src/common/time'
import { getGearIcon } from '../../common/util.mjs'

export default class RegularGearCard extends WxWorkGenerator {
  name = 'Regular Gear'
  key = 'gear-regular'

  async #getLatestGear() {
    await this.preparePinia();

    return useGearStore().regularGear?.slice().reverse()[0];
  }

  async getMessage() {
    const gear = await this.#getLatestGear();

    const icon = getGearIcon(gear)
    const name = $t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)
    const power = $t(
      `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
      gear.gear.primaryGearPower.name
    )
    const time = $t('time.left', { time: formatShortDurationFromNow(gear.gear.saleEndTime) })

    const payload = {
        msgtype: 'template_card',
        template_card: {
          card_type: 'news_notice',
          source: {
            icon_url: `${process.env.UPYUN_DOMAIN}/icon3.png!sm`,
            desc: '鱿鱼须商城·目前贩卖',
            desc_color: 0,
          },
          main_title: {
            title: `🦑 鱿鱼须商城上新啦`,
            misc: time,
          },
          card_image: {
            url: `${process.env.UPYUN_DOMAIN}/${this.key}.png!sm`,
            aspect_ratio: 1.78,
          },
          horizontal_content_list: {
            keyname: icon,
            value: `${name}\n(${power})`,
          },
          card_action: {
            type: 1,
            url: `${process.env.UPYUN_DOMAIN}/${this.key}.png!sm`,
          },
        },
      }
      return payload
  }

}
