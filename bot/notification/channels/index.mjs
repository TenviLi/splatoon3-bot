import { defineChannelAdapter } from '../ChannelAdapter.mjs'
import { deliverDingTalk, deliverDingTalkDigest, dingTalkTargetSchema } from './DingTalkChannel.mjs'
import { deliverDiscord, deliverDiscordDigest, discordTargetSchema } from './DiscordChannel.mjs'
import { deliverFeishu, feishuTargetSchema } from './FeishuChannel.mjs'
import {
  createLineDeliveryOptions,
  deliverLine,
  deliverLineDigest,
  lineTargetSchema,
} from './LineChannel.mjs'
import { deliverQQ, qqTargetSchema } from './QQChannel.mjs'
import { deliverSlack, deliverSlackDigest, slackTargetSchema } from './SlackChannel.mjs'
import { deliverTelegram, telegramTargetSchema } from './TelegramChannel.mjs'
import {
  deliverWeCom,
  deliverWeComDigest,
  weComMessageBudget,
  wecomTargetSchema,
} from './WeComChannel.mjs'
import { deliverWhatsApp, whatsAppTargetSchema } from './WhatsAppChannel.mjs'

const lineImageVariant = Object.freeze({
  name: 'line',
  directory: 'line-images',
  dimensions: Object.freeze({ width: 1024, height: 576 }),
  maximumBytes: 1_000_000,
  maximumBytesLabel: '1 MB',
  paletteFallback: true,
})
const whatsAppImageVariant = Object.freeze({
  name: 'whatsapp',
  directory: 'whatsapp-images',
  dimensions: Object.freeze({ width: 1024, height: 576 }),
  maximumBytes: 5 * 1024 * 1024,
  maximumBytesLabel: '5 MB',
  paletteFallback: false,
})

const channels = Object.freeze({
  wecom: defineChannelAdapter({
    name: 'wecom',
    configurationEnvironmentVariable: 'BOT_WECOM_CONFIG',
    targetSchema: wecomTargetSchema,
    capabilities: {
      digest: { policy: 'native', maximumItemsPerDelivery: 10 },
      messageBudget: weComMessageBudget,
    },
    deliver: deliverWeCom,
    deliverDigest: deliverWeComDigest,
  }),
  discord: defineChannelAdapter({
    name: 'discord',
    configurationEnvironmentVariable: 'BOT_DISCORD_CONFIG',
    targetSchema: discordTargetSchema,
    capabilities: {
      digest: { policy: 'native', maximumItemsPerDelivery: 10 },
      messageBudget: { embedsPerMessage: 10, embedCharacters: 6_000 },
    },
    deliver: deliverDiscord,
    deliverDigest: deliverDiscordDigest,
    extractReceipt: (response) => response?.json?.id || response?.[0]?.json?.id,
  }),
  telegram: defineChannelAdapter({
    name: 'telegram',
    configurationEnvironmentVariable: 'BOT_TELEGRAM_CONFIG',
    targetSchema: telegramTargetSchema,
    capabilities: { messageBudget: { captionCharacters: 1_024 } },
    deliver: deliverTelegram,
    extractReceipt: (response) => response?.result?.message_id,
  }),
  qq: defineChannelAdapter({
    name: 'qq',
    configurationEnvironmentVariable: 'BOT_QQ_CONFIG',
    targetSchema: qqTargetSchema,
    capabilities: {},
    deliver: deliverQQ,
    extractReceipt: (response) => response?.json?.id || response?.json?.message_id,
  }),
  feishu: defineChannelAdapter({
    name: 'feishu',
    configurationEnvironmentVariable: 'BOT_FEISHU_CONFIG',
    targetSchema: feishuTargetSchema,
    capabilities: { messageBudget: { cardBytes: 20_000 } },
    deliver: deliverFeishu,
  }),
  dingtalk: defineChannelAdapter({
    name: 'dingtalk',
    configurationEnvironmentVariable: 'BOT_DINGTALK_CONFIG',
    targetSchema: dingTalkTargetSchema,
    capabilities: {
      digest: { policy: 'native', maximumItemsPerDelivery: 10 },
      messageBudget: { feedItemsPerMessage: 10 },
    },
    deliver: deliverDingTalk,
    deliverDigest: deliverDingTalkDigest,
  }),
  whatsapp: defineChannelAdapter({
    name: 'whatsapp',
    configurationEnvironmentVariable: 'BOT_WHATSAPP_CONFIG',
    targetSchema: whatsAppTargetSchema,
    capabilities: {
      asset: { protocol: 'https-only', variant: 'whatsapp', variantDefinition: whatsAppImageVariant },
      retry: { maximumAttempts: 2 },
      messageBudget: { templateBodyCharacters: 560 },
    },
    deliver: deliverWhatsApp,
    extractReceipt: (response) => response?.messages?.[0]?.id,
  }),
  line: defineChannelAdapter({
    name: 'line',
    configurationEnvironmentVariable: 'BOT_LINE_CONFIG',
    targetSchema: lineTargetSchema,
    capabilities: {
      asset: { protocol: 'https-only', variant: 'line', variantDefinition: lineImageVariant },
      digest: { policy: 'native', maximumItemsPerDelivery: 60 },
      retry: {
        idempotency: 'line-retry-key',
        maximumAttempts: 2,
        retryableStatuses: [429, 502, 503, 504],
      },
      messageBudget: {
        bubblesPerCarousel: 12,
        messagesPerPush: 5,
        bubbleBytes: 30_000,
        carouselBytes: 50_000,
      },
    },
    deliver: deliverLine,
    deliverDigest: deliverLineDigest,
    deliveryOptionsFactory: createLineDeliveryOptions,
    extractReceipt: (response) =>
      response?.acceptedRequestId || response?.headers?.get?.('x-line-request-id'),
  }),
  slack: defineChannelAdapter({
    name: 'slack',
    configurationEnvironmentVariable: 'BOT_SLACK_CONFIG',
    targetSchema: slackTargetSchema,
    capabilities: {
      digest: { policy: 'native', maximumItemsPerDelivery: 24 },
      messageBudget: { blocks: 50, fallbackCharacters: 4_000 },
    },
    deliver: deliverSlack,
    deliverDigest: deliverSlackDigest,
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
