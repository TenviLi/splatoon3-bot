import assert from 'node:assert/strict'
import test from 'node:test'
import { createNotification } from '../bot/notification/Notification.mjs'
import { deliverDingTalk } from '../bot/notification/channels/DingTalkChannel.mjs'
import { deliverDiscord } from '../bot/notification/channels/DiscordChannel.mjs'
import { deliverFeishu } from '../bot/notification/channels/FeishuChannel.mjs'
import { deliverQQ, qqTargetSchema } from '../bot/notification/channels/QQChannel.mjs'
import { deliverTelegram } from '../bot/notification/channels/TelegramChannel.mjs'
import { deliverWeCom } from '../bot/notification/channels/WeComChannel.mjs'
import { resolveConfiguredNotificationChannels } from '../bot/notification/channels/index.mjs'

const notification = createNotification({
  id: 'schedules',
  source: { name: '今天你喷喷了吗?', iconUrl: 'https://example.com/icon.png' },
  title: '日程已更新',
  subtitle: '02:00 - 04:00',
  image: { url: 'https://example.com/schedules.png', alt: '对战日程', aspectRatio: 1.78 },
  sections: [{ title: '占地对战', text: '鱼肉碎金属·烟管鱼市场', listItems: ['斯普拉射击枪'] }],
  facts: [{ label: '规则', value: '占地' }],
  action: { label: '查看日程截图', url: 'https://example.com/schedules.png' },
})

const denseNotification = createNotification({
  id: 'schedules',
  source: { name: '来源'.repeat(200), iconUrl: 'https://example.com/icon.png' },
  title: '日程已更新'.repeat(100),
  subtitle: '02:00 - 04:00 '.repeat(400),
  image: { url: 'https://example.com/schedules.png', alt: '对战日程'.repeat(200), aspectRatio: 1.78 },
  sections: Array.from({ length: 30 }, (_, index) => ({
    title: `模式 ${index} `.repeat(80),
    text: `场地 ${index} `.repeat(500),
    listItems: Array.from({ length: 20 }, (__, itemIndex) => `武器 ${itemIndex} `.repeat(100)),
  })),
  facts: Array.from({ length: 30 }, (_, index) => ({
    label: `规则 ${index} `.repeat(50),
    value: `详情 ${index} `.repeat(300),
  })),
  action: { label: '查看日程截图'.repeat(50), url: 'https://example.com/schedules.png' },
})

function response(value, status = 200) {
  return new Response(value == null ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function discordEmbedTextLength(embed) {
  return [
    embed.author?.name,
    embed.title,
    embed.description,
    embed.footer?.text,
    ...embed.fields.flatMap((field) => [field.name, field.value]),
  ]
    .filter(Boolean)
    .reduce((total, value) => total + value.length, 0)
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
  assert.deepEqual(payload.template_card.horizontal_content_list[0], {
    keyname: '-',
    value: '斯普拉射击枪',
  })
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
  assert.equal(payload.embeds[0].thumbnail.url, notification.source.iconUrl)
  assert.equal(payload.embeds[0].url, notification.action.url)
  assert.equal(payload.embeds[0].fields.length, 2)
  assert.match(payload.embeds[0].fields[0].value, /• 斯普拉射击枪/)
  assert.match(payload.embeds[0].footer.text, /今天你喷喷了吗/)
  assert.equal(payload.allowed_mentions.parse.length, 0)
})

test('Discord enforces the aggregate Embed text budget', async () => {
  let payload
  await deliverDiscord(
    denseNotification,
    { name: 'dense', webhookUrl: 'https://discord.com/api/webhooks/1/token' },
    {
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body)
        return response({ id: 'message' })
      },
    }
  )

  assert.ok(discordEmbedTextLength(payload.embeds[0]) <= 6000)
  assert.ok(payload.embeds[0].fields.length <= 25)
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
  assert.match(payload.caption, /<blockquote>02:00 - 04:00<\/blockquote>/)
  assert.match(payload.caption, /• 斯普拉射击枪/)
  assert.ok(payload.caption.length <= 1024)
  assert.equal(payload.reply_markup.inline_keyboard[0][0].url, notification.action.url)
})

test('Telegram preserves valid HTML while fitting the caption limit', async () => {
  let payload
  await deliverTelegram(denseNotification, { name: 'dense', botToken: 'token', chatId: '-10001' }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response({ ok: true, result: { message_id: 1 } })
    },
  })

  assert.ok(payload.caption.length <= 1024)
  assert.match(payload.caption, /规则 0/)
  for (const tag of ['b', 'i', 'blockquote']) {
    assert.equal(
      payload.caption.match(new RegExp(`<${tag}>`, 'g'))?.length || 0,
      payload.caption.match(new RegExp(`</${tag}>`, 'g'))?.length || 0
    )
  }
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
  const messagePayload = JSON.parse(requests[1].options.body)
  assert.match(messagePayload.markdown.content, /schedules\.png/)
  assert.match(messagePayload.markdown.content, /#1200px #675px/)
  assert.match(messagePayload.markdown.content, /- 斯普拉射击枪/)
})

test('QQ defaults channel targets to an Embed and gates channel-only formatting', async () => {
  const requests = []
  await deliverQQ(
    notification,
    {
      name: 'channel',
      appId: 'channel-app-id',
      clientSecret: 'channel-client-secret',
      targetType: 'channel',
      targetId: 'channel-id',
    },
    {
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options })
        if (String(url).includes('getAppAccessToken')) {
          return response({ access_token: 'channel-access-token', expires_in: '7200' })
        }
        return response({ id: 'message' })
      },
    }
  )

  const payload = JSON.parse(requests[1].options.body)
  assert.match(requests[1].url, /\/channels\/channel-id\/messages$/)
  assert.equal(payload.embed.thumbnail.url, notification.image.url)
  assert.match(payload.content, /查看日程截图/)
  assert.match(payload.embed.fields[1].name, /规则/)
  assert.equal(payload.markdown, undefined)
  for (const messageFormat of ['embed', 'markdown']) {
    assert.equal(qqTargetSchema.safeParse({
      name: 'group',
      appId: 'app-id',
      clientSecret: 'secret',
      targetType: 'group',
      targetId: 'group-id',
      messageFormat,
    }).success, false)
  }
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
  assert.equal(payload.card.schema, '2.0')
  assert.equal(payload.card.header.title.content, notification.title)
  assert.equal(payload.card.header.template, 'turquoise')
  assert.match(payload.card.body.elements[2].content, /• 斯普拉射击枪/)
  assert.equal(payload.card.body.elements.find((element) => element.tag === 'column_set').columns.length, 1)
  assert.match(payload.card.body.elements.at(-2).content, /schedules\.png/)
  assert.equal(payload.card.body.elements.at(-1).behaviors[0].type, 'open_url')
  assert.equal(payload.card.body.elements.at(-1).behaviors[0].default_url, notification.action.url)
})

test('Feishu keeps Card 2.0 payloads within the custom-bot request limit', async () => {
  let payload
  await deliverFeishu(denseNotification, { name: 'dense', webhookUrl: 'https://example.com/feishu' }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response({ code: 0 })
    },
  })

  assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 20_000)
  assert.equal(payload.card.body.elements.at(-1).behaviors[0].type, 'open_url')
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
  assert.match(payload.actionCard.text, /- 斯普拉射击枪/)
  assert.equal(payload.actionCard.hideAvatar, '0')
})

test('DingTalk keeps complete Markdown blocks within its local presentation budget', async () => {
  let payload
  await deliverDingTalk(denseNotification, { name: 'dense', webhookUrl: 'https://example.com/dingtalk' }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response({ errcode: 0 })
    },
  })

  assert.ok(payload.actionCard.text.length <= 12_000)
  assert.match(payload.actionCard.text, /schedules\.png/)
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
