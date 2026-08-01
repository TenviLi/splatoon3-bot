import path from 'node:path'
import { createBotContext } from '../../bot/notification/BotContext.mjs'
import { createNotification } from '../../bot/notification/Notification.mjs'
import { composeNotification } from '../../bot/notification/NotificationComposer.mjs'
import { getChannelAdapter } from '../../bot/notification/channels/index.mjs'
import { listRunProfiles } from '../../bot/run/RunPlan.mjs'
import { createPublicationManifestFixture } from './PublicationManifestFixture.mjs'

const notificationIds = Object.freeze([
  ...new Set(listRunProfiles().flatMap((profile) => profile.notifications)),
])
const validImageMetadata = Object.freeze({ format: 'png', width: 1024, height: 576, bytes: 800_000 })

const platformCases = Object.freeze([
  Object.freeze({
    name: 'wecom',
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://example.com/wecom' }),
    successBody: Object.freeze({ errcode: 0 }),
  }),
  Object.freeze({
    name: 'discord',
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://discord.com/api/webhooks/1/token' }),
    successBody: Object.freeze({ id: 'message' }),
  }),
  Object.freeze({
    name: 'telegram',
    target: Object.freeze({ name: 'golden', botToken: 'token', chatId: '-10001' }),
    successBody: Object.freeze({ ok: true, result: Object.freeze({ message_id: 1 }) }),
  }),
  Object.freeze({
    name: 'feishu',
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://example.com/feishu' }),
    successBody: Object.freeze({ code: 0 }),
  }),
  Object.freeze({
    name: 'dingtalk',
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://example.com/dingtalk' }),
    successBody: Object.freeze({ errcode: 0 }),
  }),
  Object.freeze({
    name: 'slack',
    target: Object.freeze({ name: 'golden', webhookUrl: 'https://hooks.slack.com/services/T/B/key' }),
    createSuccessResponse: () => new Response('ok', { status: 200 }),
  }),
  Object.freeze({
    name: 'line',
    target: Object.freeze({
      name: 'golden',
      channelAccessToken: 'line-token',
      targetType: 'user',
      targetId: 'U0123456789abcdef0123456789abcdef',
    }),
    successBody: Object.freeze({}),
    options: Object.freeze({ inspectImage: async () => validImageMetadata }),
  }),
  Object.freeze({
    name: 'whatsapp',
    target: Object.freeze({
      name: 'golden',
      accessToken: 'whatsapp-token',
      phoneNumberId: '123456789012345',
      recipientPhoneNumber: '8613800000000',
      templateName: 'splatoon_notification',
      languageCode: 'zh_CN',
    }),
    successBody: Object.freeze({ messages: Object.freeze([Object.freeze({ id: 'wamid.golden' })]) }),
    options: Object.freeze({
      assetBaseUrl: 'https://cdn.example.com',
      inspectImage: async () => validImageMetadata,
    }),
  }),
])

const escapingNotification = createNotification({
  id: 'escaping-contract',
  source: { name: '来源 <&> *喷喷*', iconUrl: 'https://cdn.example.com/icon.png' },
  title: '特殊 <&> *标题* [链接]',
  subtitle: '时间 <02:00> & _下划线_',
  image: {
    url: 'https://cdn.example.com/escaping.png',
    alt: '截图 (特殊) <&>',
    width: 2400,
    height: 1350,
    aspectRatio: 2400 / 1350,
    compact: {
      url: 'https://cdn.example.com/escaping-compact.png',
      width: 1024,
      height: 576,
      aspectRatio: 1024 / 576,
    },
  },
  sections: [
    {
      title: '模式 *A* [测试]',
      text: '场地 <A> & B _下划线_',
      listItems: ['武器 (测试)'],
    },
  ],
  facts: [{ label: '规则 [链接]', value: '值 *粗体* & <tag>' }],
  action: { label: '查看 [详情]', url: 'https://cdn.example.com/escaping.png' },
})

function response(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function capturePayload(deliver, notification, platformCase) {
  let payload
  await deliver(notification, platformCase.target, {
    ...platformCase.options,
    fetchImpl: async (_url, requestOptions) => {
      payload = JSON.parse(requestOptions.body)
      return platformCase.createSuccessResponse?.() || response(platformCase.successBody)
    },
  })
  return payload
}

async function captureQQPayload(notification, target) {
  let payload
  await getChannelAdapter('qq').deliver(notification, target, {
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
  const publicationManifest = createPublicationManifestFixture('all')
  const notifications = [
    ...notificationIds.map((notificationId) =>
      composeNotification(notificationId, context, { publicationManifest })
    ),
    escapingNotification,
  ]
  const payloads = Object.fromEntries([
    ...platformCases.map((platformCase) => [platformCase.name, {}]),
    ['qq-group', {}],
  ])

  for (const notification of notifications) {
    for (const platformCase of platformCases) {
      payloads[platformCase.name][notification.id] = await capturePayload(
        getChannelAdapter(platformCase.name).deliver,
        notification,
        platformCase
      )
    }
    payloads['qq-group'][notification.id] = await captureQQPayload(notification, {
      name: 'golden-group',
      appId: 'golden-group-app',
      clientSecret: 'golden-group-secret',
      targetType: 'group',
      targetId: 'group-openid',
    })
  }

  return payloads
}
