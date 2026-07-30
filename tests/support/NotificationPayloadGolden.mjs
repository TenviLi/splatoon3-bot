import path from 'node:path'
import { createBotContext } from '../../bot/notification/BotContext.mjs'
import { createNotification } from '../../bot/notification/Notification.mjs'
import { composeNotification } from '../../bot/notification/NotificationComposer.mjs'
import { deliverDingTalk } from '../../bot/notification/channels/DingTalkChannel.mjs'
import { deliverDiscord } from '../../bot/notification/channels/DiscordChannel.mjs'
import { deliverFeishu } from '../../bot/notification/channels/FeishuChannel.mjs'
import { deliverQQ } from '../../bot/notification/channels/QQChannel.mjs'
import { deliverTelegram } from '../../bot/notification/channels/TelegramChannel.mjs'
import { deliverWeCom } from '../../bot/notification/channels/WeComChannel.mjs'
import { listRunProfiles } from '../../bot/run/RunPlan.mjs'

const notificationIds = Object.freeze([
  ...new Set(listRunProfiles().flatMap((profile) => profile.notifications)),
])

const platformCases = Object.freeze([
  Object.freeze({
    name: 'wecom',
    deliver: deliverWeCom,
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://example.com/wecom' }),
    successBody: Object.freeze({ errcode: 0 }),
  }),
  Object.freeze({
    name: 'discord',
    deliver: deliverDiscord,
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://discord.com/api/webhooks/1/token' }),
    successBody: Object.freeze({ id: 'message' }),
  }),
  Object.freeze({
    name: 'telegram',
    deliver: deliverTelegram,
    target: Object.freeze({ name: 'golden', botToken: 'token', chatId: '-10001' }),
    successBody: Object.freeze({ ok: true, result: Object.freeze({ message_id: 1 }) }),
  }),
  Object.freeze({
    name: 'feishu',
    deliver: deliverFeishu,
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://example.com/feishu' }),
    successBody: Object.freeze({ code: 0 }),
  }),
  Object.freeze({
    name: 'dingtalk',
    deliver: deliverDingTalk,
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://example.com/dingtalk' }),
    successBody: Object.freeze({ errcode: 0 }),
  }),
])

const escapingNotification = createNotification({
  id: 'escaping-contract',
  source: { name: '来源 <&> *喷喷*', iconUrl: 'https://cdn.example.com/icon.png!sm' },
  title: '特殊 <&> *标题* [链接]',
  subtitle: '时间 <02:00> & _下划线_',
  image: {
    url: 'https://cdn.example.com/escaping.png!sm',
    alt: '截图 (特殊) <&>',
    aspectRatio: 1.78,
  },
  sections: [
    {
      title: '模式 *A* [测试]',
      text: '场地 <A> & B _下划线_',
      listItems: ['武器 (测试)'],
    },
  ],
  facts: [{ label: '规则 [链接]', value: '值 *粗体* & <tag>' }],
  action: { label: '查看 [详情]', url: 'https://cdn.example.com/escaping.png!sm' },
})

function response(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function capturePayload(deliver, notification, target, successBody) {
  let payload
  await deliver(notification, target, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response(successBody)
    },
  })
  return payload
}

async function captureQQPayload(notification, target) {
  let payload
  await deliverQQ(notification, target, {
    fetchImpl: async (url, options) => {
      if (String(url).includes('getAppAccessToken')) {
        return response({ access_token: `token-${target.targetType}`, expires_in: '7200' })
      }
      payload = JSON.parse(options.body)
      return response({ id: 'message' })
    },
  })
  return payload
}

export async function createNotificationPayloadGolden() {
  const context = await createBotContext({
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
  })
  const notifications = [
    ...notificationIds.map((notificationId) =>
      composeNotification(notificationId, context, { assetBaseUrl: 'https://cdn.example.com' })
    ),
    escapingNotification,
  ]
  const payloads = Object.fromEntries([
    ...platformCases.map((platformCase) => [platformCase.name, {}]),
    ['qq-group', {}],
    ['qq-channel', {}],
  ])

  for (const notification of notifications) {
    for (const platformCase of platformCases) {
      payloads[platformCase.name][notification.id] = await capturePayload(
        platformCase.deliver,
        notification,
        platformCase.target,
        platformCase.successBody
      )
    }
    payloads['qq-group'][notification.id] = await captureQQPayload(notification, {
      name: 'golden-group',
      appId: 'golden-group-app',
      clientSecret: 'golden-group-secret',
      targetType: 'group',
      targetId: 'group-openid',
    })
    payloads['qq-channel'][notification.id] = await captureQQPayload(notification, {
      name: 'golden-channel',
      appId: 'golden-channel-app',
      clientSecret: 'golden-channel-secret',
      targetType: 'channel',
      targetId: 'channel-id',
    })
  }

  return payloads
}
