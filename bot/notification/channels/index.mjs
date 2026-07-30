import { deliverDingTalk, dingTalkTargetSchema } from './DingTalkChannel.mjs'
import { deliverDiscord, discordTargetSchema } from './DiscordChannel.mjs'
import { deliverFeishu, feishuTargetSchema } from './FeishuChannel.mjs'
import { deliverQQ, qqTargetSchema } from './QQChannel.mjs'
import { deliverTelegram, telegramTargetSchema } from './TelegramChannel.mjs'
import { deliverWeCom, wecomTargetSchema } from './WeComChannel.mjs'

const channels = Object.freeze({
  wecom: Object.freeze({ name: 'wecom', targetSchema: wecomTargetSchema, deliver: deliverWeCom }),
  discord: Object.freeze({ name: 'discord', targetSchema: discordTargetSchema, deliver: deliverDiscord }),
  telegram: Object.freeze({ name: 'telegram', targetSchema: telegramTargetSchema, deliver: deliverTelegram }),
  qq: Object.freeze({ name: 'qq', targetSchema: qqTargetSchema, deliver: deliverQQ }),
  feishu: Object.freeze({ name: 'feishu', targetSchema: feishuTargetSchema, deliver: deliverFeishu }),
  dingtalk: Object.freeze({ name: 'dingtalk', targetSchema: dingTalkTargetSchema, deliver: deliverDingTalk }),
})

export function getChannelAdapter(name) {
  const channel = channels[name]
  if (!channel) {
    throw new Error(`Unknown notification channel: ${name}`)
  }

  return channel
}
