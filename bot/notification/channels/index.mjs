import { deliverDingTalk, dingTalkTargetSchema } from './DingTalkChannel.mjs'
import { deliverDiscord, discordTargetSchema } from './DiscordChannel.mjs'
import { deliverFeishu, feishuTargetSchema } from './FeishuChannel.mjs'
import { deliverLine, lineTargetSchema } from './LineChannel.mjs'
import { deliverQQ, qqTargetSchema } from './QQChannel.mjs'
import { deliverSlack, slackTargetSchema } from './SlackChannel.mjs'
import { deliverTelegram, telegramTargetSchema } from './TelegramChannel.mjs'
import { deliverWeCom, wecomTargetSchema } from './WeComChannel.mjs'
import { deliverWhatsApp, whatsAppTargetSchema } from './WhatsAppChannel.mjs'

const channels = Object.freeze({
  wecom: Object.freeze({
    name: 'wecom',
    configurationEnvironmentVariable: 'BOT_WECOM_CONFIG',
    targetSchema: wecomTargetSchema,
    deliver: deliverWeCom,
  }),
  discord: Object.freeze({
    name: 'discord',
    configurationEnvironmentVariable: 'BOT_DISCORD_CONFIG',
    targetSchema: discordTargetSchema,
    deliver: deliverDiscord,
  }),
  telegram: Object.freeze({
    name: 'telegram',
    configurationEnvironmentVariable: 'BOT_TELEGRAM_CONFIG',
    targetSchema: telegramTargetSchema,
    deliver: deliverTelegram,
  }),
  qq: Object.freeze({
    name: 'qq',
    configurationEnvironmentVariable: 'BOT_QQ_CONFIG',
    targetSchema: qqTargetSchema,
    deliver: deliverQQ,
  }),
  feishu: Object.freeze({
    name: 'feishu',
    configurationEnvironmentVariable: 'BOT_FEISHU_CONFIG',
    targetSchema: feishuTargetSchema,
    deliver: deliverFeishu,
  }),
  dingtalk: Object.freeze({
    name: 'dingtalk',
    configurationEnvironmentVariable: 'BOT_DINGTALK_CONFIG',
    targetSchema: dingTalkTargetSchema,
    deliver: deliverDingTalk,
  }),
  whatsapp: Object.freeze({
    name: 'whatsapp',
    configurationEnvironmentVariable: 'BOT_WHATSAPP_CONFIG',
    targetSchema: whatsAppTargetSchema,
    deliver: deliverWhatsApp,
  }),
  line: Object.freeze({
    name: 'line',
    configurationEnvironmentVariable: 'BOT_LINE_CONFIG',
    targetSchema: lineTargetSchema,
    deliver: deliverLine,
  }),
  slack: Object.freeze({
    name: 'slack',
    configurationEnvironmentVariable: 'BOT_SLACK_CONFIG',
    targetSchema: slackTargetSchema,
    deliver: deliverSlack,
  }),
})
const channelAdapters = Object.freeze(Object.values(channels))

export function listChannelAdapters() {
  return channelAdapters
}

export function getChannelAdapter(name) {
  const channel = channels[name]
  if (!channel) {
    throw new Error(`Unknown notification channel: ${name}`)
  }

  return channel
}

export function resolveConfiguredNotificationChannels({ environment = process.env, channelName } = {}) {
  const selectedChannels = channelName ? [getChannelAdapter(channelName)] : channelAdapters
  const configuredChannels = selectedChannels.flatMap((channel) => {
    const rawConfig = String(environment[channel.configurationEnvironmentVariable] || '').trim()
    return rawConfig ? [{ channel, rawConfig }] : []
  })

  if (channelName && configuredChannels.length === 0) {
    const channel = selectedChannels[0]
    throw new Error(`${channel.configurationEnvironmentVariable} is required for ${channel.name}`)
  }

  return configuredChannels
}
