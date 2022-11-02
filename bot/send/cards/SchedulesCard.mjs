import WxWorkGenerator, { $d, $t } from './Generator.mjs'
import {
  useAnarchyOpenSchedulesStore,
  useAnarchySeriesSchedulesStore,
  useRegularSchedulesStore,
} from '../../../src/stores/schedules.mjs'

export default class SchedulesCard extends WxWorkGenerator {
  name = 'Schedules'
  key = 'schedules'

  async #getStages() {
    await this.preparePinia()

    return {
      regular: useRegularSchedulesStore().activeSchedule,
      anarchySeries: useAnarchySeriesSchedulesStore().activeSchedule,
      anarchyOpen: useAnarchyOpenSchedulesStore().activeSchedule,
    }
  }

  async getMessage() {
    const stages = await this.#getStages()

    // const detail = (s) => ({
    //   title: s.settings.vsRule.name,
    //   desc: `${s.settings.vsStages[0].name}\n${s.settings.vsStages[1].name}`,
    // })

    const payload = {
      msgtype: 'template_card',
      template_card: {
        card_type: 'news_notice',
        source: {
          icon_url: `${process.env.UPYUN_DOMAIN}/icon.png!sm`,
          desc: `今天你喷喷了吗?`,
          desc_color: 0,
        },
        main_title: {
          title: '日程已更新',
          desc: `${$d(stages.regular.startTime, 'time')} - ${$d(stages.regular.endTime, 'time')}`,
        },
        card_image: {
          url: `${process.env.UPYUN_DOMAIN}/schedules.png!sm`,
          aspect_ratio: 1.78,
        },
        vertical_content_list: [
          {
            title: '🔫 占地对战',
            desc: `${$t(
              `splatnet.stages.${stages.regular.settings.vsStages[0].id}.name`,
              stages.regular.settings.vsStages[0].name
            )} . ${$t(
              `splatnet.stages.${stages.regular.settings.vsStages[1].id}.name`,
              stages.regular.settings.vsStages[1].name
            )}`,
          },
          {
            title:
              '🔰 ' +
              $t(
                `splatnet.rules.${stages.anarchySeries.settings.vsRule.id}.name`,
                stages.anarchySeries.settings.vsRule.name
              ).replace('对战', '') +
              '  (挑战)',
            desc: `${$t(
              `splatnet.stages.${stages.anarchySeries.settings.vsStages[0].id}.name`,
              stages.anarchySeries.settings.vsStages[0].name
            )} . ${$t(
              `splatnet.stages.${stages.anarchySeries.settings.vsStages[1].id}.name`,
              stages.anarchySeries.settings.vsStages[1].name
            )}`,
          },
          {
            title:
              '🔰 ' +
              $t(
                `splatnet.rules.${stages.anarchyOpen.settings.vsRule.id}.name`,
                stages.anarchyOpen.settings.vsRule.name
              ).replace('对战', '') +
              '  (开放)',
            desc: `${$t(
              `splatnet.stages.${stages.anarchyOpen.settings.vsStages[0].id}.name`,
              stages.anarchyOpen.settings.vsStages[0].name
            )} . ${$t(
              `splatnet.stages.${stages.anarchyOpen.settings.vsStages[1].id}.name`,
              stages.anarchyOpen.settings.vsStages[1].name
            )}`,
          },
        ],
        card_action: {
          type: 1,
          url: `${process.env.UPYUN_DOMAIN}/schedules.png!sm`,
        },
      },
    }
    return payload
  }
}
