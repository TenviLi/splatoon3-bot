import assert from 'node:assert/strict'
import test from 'node:test'
import { createNotification } from '../bot/notification/Notification.mjs'
import { deliverDingTalk } from '../bot/notification/channels/DingTalkChannel.mjs'
import { deliverDiscord } from '../bot/notification/channels/DiscordChannel.mjs'
import { deliverFeishu } from '../bot/notification/channels/FeishuChannel.mjs'
import { deliverQQ } from '../bot/notification/channels/QQChannel.mjs'
import { deliverTelegram } from '../bot/notification/channels/TelegramChannel.mjs'
import { deliverWeCom } from '../bot/notification/channels/WeComChannel.mjs'
import { resolveConfiguredNotificationChannels } from '../bot/notification/channels/index.mjs'

const notification = createNotification({
  id: 'schedules',
  source: { name: '今天你喷喷了吗?', iconUrl: 'https://example.com/icon.png' },
  title: '日程已更新',
  subtitle: '02:00 - 04:00',
  image: { url: 'https://example.com/schedules.png', alt: '对战日程', aspectRatio: 1.78 },
  sections: [{ title: '占地对战', text: '鱼肉碎金属·烟管鱼市场' }],
  facts: [{ label: '规则', value: '占地' }],
  action: { label: '查看日程截图', url: 'https://example.com/schedules.png' },
})

function response(value, status = 200) {
  return new Response(value == null ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('WeCom uses a news notice template card', async () => {
  let payload
  await deliverWeCom(notification, { name: 'main', webhookUrl: 'https://example.com/wecom' }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response({ errcode: 0 })
    },
  })
  assert.equal(payload.msgtype, 'template_card')
  assert.equal(payload.template_card.card_type, 'news_notice')
  assert.equal(payload.template_card.card_image.url, notification.image.url)
})

test('Discord uses an embed with an image and fields', async () => {
  let payload
  let requestedUrl
  await deliverDiscord(notification, { name: 'main', webhookUrl: 'https://discord.com/api/webhooks/1/token' }, {
    fetchImpl: async (url, options) => {
      requestedUrl = String(url)
      payload = JSON.parse(options.body)
      return response({ id: 'message' })
    },
  })
  assert.match(requestedUrl, /wait=true/)
  assert.equal(payload.embeds[0].image.url, notification.image.url)
  assert.equal(payload.embeds[0].fields.length, 2)
})

test('Telegram uses sendPhoto with HTML and an action button', async () => {
  let payload
  let requestedUrl
  await deliverTelegram(notification, { name: 'main', botToken: 'token', chatId: '-10001' }, {
    fetchImpl: async (url, options) => {
      requestedUrl = String(url)
      payload = JSON.parse(options.body)
      return response({ ok: true, result: { message_id: 1 } })
    },
  })
  assert.match(requestedUrl, /\/bottoken\/sendPhoto$/)
  assert.equal(payload.photo, notification.image.url)
  assert.equal(payload.reply_markup.inline_keyboard[0][0].url, notification.action.url)
})

test('QQ uses official access tokens and native Markdown', async () => {
  const requests = []
  await deliverQQ(
    notification,
    {
      name: 'group',
      appId: 'app-id',
      clientSecret: 'client-secret',
      targetType: 'group',
      targetId: 'group-openid',
    },
    {
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options })
        if (String(url).includes('getAppAccessToken')) {
          return response({ access_token: 'access-token', expires_in: '7200' })
        }
        return response({ id: 'message' })
      },
    }
  )
  assert.equal(requests.length, 2)
  assert.match(requests[1].url, /\/v2\/groups\/group-openid\/messages$/)
  assert.equal(requests[1].options.headers.Authorization, 'QQBot access-token')
  assert.match(JSON.parse(requests[1].options.body).markdown.content, /schedules\.png/)
})

test('Feishu uses an interactive card', async () => {
  let payload
  await deliverFeishu(notification, { name: 'main', webhookUrl: 'https://example.com/feishu' }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response({ code: 0 })
    },
  })
  assert.equal(payload.msg_type, 'interactive')
  assert.equal(payload.card.header.title.content, notification.title)
  assert.equal(payload.card.elements.at(-1).actions[0].url, notification.action.url)
})

test('DingTalk uses an action card with a Markdown image', async () => {
  let payload
  await deliverDingTalk(notification, { name: 'main', webhookUrl: 'https://example.com/dingtalk' }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response({ errcode: 0 })
    },
  })
  assert.equal(payload.msgtype, 'actionCard')
  assert.match(payload.actionCard.text, /!\[对战日程\]\(https:\/\/example\.com\/schedules\.png\)/)
})

test('platform business errors reject delivery', async () => {
  await assert.rejects(
    deliverWeCom(notification, { name: 'main', webhookUrl: 'https://example.com/wecom' }, {
      fetchImpl: async () => response({ errcode: 93000, errmsg: 'invalid webhook' }),
    }),
    /rejected the notification/
  )
})

test('maps every Channel adapter to its explicit configuration Secret', () => {
  const channelSecrets = [
    ['wecom', 'BOT_WECOM_CONFIG'],
    ['discord', 'BOT_DISCORD_CONFIG'],
    ['telegram', 'BOT_TELEGRAM_CONFIG'],
    ['qq', 'BOT_QQ_CONFIG'],
    ['feishu', 'BOT_FEISHU_CONFIG'],
    ['dingtalk', 'BOT_DINGTALK_CONFIG'],
  ]

  for (const [channelName, secretName] of channelSecrets) {
    const rawConfig = `configuration-for-${channelName}`
    const configuredChannels = resolveConfiguredNotificationChannels({
      environment: { [secretName]: rawConfig },
    })

    assert.equal(configuredChannels.length, 1)
    assert.equal(configuredChannels[0].channel.name, channelName)
    assert.equal(configuredChannels[0].channel.configurationEnvironmentVariable, secretName)
    assert.equal(configuredChannels[0].rawConfig, rawConfig)
  }

  assert.deepEqual(resolveConfiguredNotificationChannels({ environment: { BOT_WECOM_CONFIG: '   ' } }), [])
  assert.throws(
    () => resolveConfiguredNotificationChannels({ environment: {}, channelName: 'unknown' }),
    /Unknown notification channel/
  )
})
