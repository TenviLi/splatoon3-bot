import WxWorkGenerator, { $t, $d } from './Generator.mjs'
import { useSalmonRunSchedulesStore } from '../../../src/stores/schedules.mjs'

export default class SalmonRunCard extends WxWorkGenerator {
  name = 'Salmon Run'
  key = 'salmon-run'

  async #getActiveSchedule() {
    await this.preparePinia()

    return useSalmonRunSchedulesStore().activeSchedule
  }

  async getMessage() {
    const schedule = await this.#getActiveSchedule()

    const hasMysteryWeapon = schedule.settings.weapons.some((w) => w.name === 'Random')

    const payload = {
      msgtype: 'template_card',
      template_card: {
        card_type: 'news_notice',
        source: {
          icon_url: `${process.env.UPYUN_DOMAIN}/icon2.png!sm`,
          desc: '打工的时间到啦!',
          desc_color: 0,
        },
        main_title: {
          title: $t(`splatnet.stages.${schedule.settings.coopStage.id}.name`, schedule.settings.coopStage.name),
          desc: `${$d(schedule.startTime, 'dateTimeShortWeekday')} - ${$d(schedule.endTime, 'dateTimeShort')}`,
        },
        card_image: {
          url: `${process.env.UPYUN_DOMAIN}/salmon-run.png!sm`,
          aspect_ratio: 1.78,
        },
        vertical_content_list: [
          {
            title: hasMysteryWeapon ? '🎉 随机武器! 随机武器!' : '🐻 发放武器:',
          },
        ],
        horizontal_content_list: hasMysteryWeapon
          ? []
          : schedule.settings.weapons.map((weapon) => ({
              keyname: '-',
              value: $t(`splatnet.weapons.${weapon.__splatoon3ink_id}.name`, weapon.name),
            })),
        card_action: {
          type: 1,
          url: `${process.env.UPYUN_DOMAIN}/salmon-run.png!sm`,
        },
      },
    }
    return payload
  }
}
