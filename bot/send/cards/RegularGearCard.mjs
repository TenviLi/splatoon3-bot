import WxWorkGenerator, { $t, $d } from './Generator.mjs'
import { useGearStore } from '../../../src/stores/gear.mjs'
import { getGearIcon } from '../../common/util.mjs'
import { useTimeStore } from '../../../src/stores/time.mjs'

function getDurationParts(value) {
  let negative = (value < 0) ? '-' : '';
  value = Math.abs(value);

  let days = Math.floor(value / 86400);
  value -= days * 86400;
  let hours = Math.floor(value / 3600) % 24;
  value -= hours * 3600;
  let minutes = Math.floor(value / 60) % 60;
  value -= minutes * 60;
  let seconds = value % 60;

  return { negative, days, hours, minutes, seconds };
}

 function formatShortDuration(value) {
  let { negative, days, hours, minutes, seconds } = getDurationParts(value);

  if (days)
    return $t('time.days', { n: `${negative}${days}` }, days);
  if (hours)
    return $t('time.hours', { n: `${negative}${hours}` }, hours);
  if (minutes)
    return $t('time.minutes', { n: `${negative}${minutes}` }, minutes);
  return $t('time.seconds', { n: `${negative}${seconds}` }, seconds);
}

 function formatShortDurationFromNow(value) {
  let time = useTimeStore();

  return formatShortDuration((Date.parse(value) - time.now) / 1000);
}

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
