import assert from 'node:assert/strict'
import test from 'node:test'
import { createNotification } from '../bot/notification/Notification.mjs'
import { deliverDingTalk } from '../bot/notification/channels/DingTalkChannel.mjs'
import { deliverDiscord } from '../bot/notification/channels/DiscordChannel.mjs'
import { deliverFeishu } from '../bot/notification/channels/FeishuChannel.mjs'
import { deliverLine, lineTargetSchema } from '../bot/notification/channels/LineChannel.mjs'
import { deliverQQ, qqTargetSchema } from '../bot/notification/channels/QQChannel.mjs'
import { deliverSlack, slackTargetSchema } from '../bot/notification/channels/SlackChannel.mjs'
import { deliverTelegram } from '../bot/notification/channels/TelegramChannel.mjs'
import { deliverWeCom } from '../bot/notification/channels/WeComChannel.mjs'
import {
  deliverWhatsApp,
  whatsAppGraphApiVersion,
  whatsAppTargetSchema,
} from '../bot/notification/channels/WhatsAppChannel.mjs'
import { resolveConfiguredNotificationChannels } from '../bot/notification/channels/index.mjs'

const notification = createNotification({
  id: 'schedules',
  source: { name: '今天你喷喷了吗?', iconUrl: 'https://example.com/icon.png' },
  title: '日程已更新',
  subtitle: '02:00 - 04:00',
  image: {
    url: 'https://example.com/schedules.png',
    alt: '对战日程',
    width: 1024,
    height: 576,
    aspectRatio: 1024 / 576,
  },
  sections: [{ title: '占地对战', text: '鱼肉碎金属·烟管鱼市场', listItems: ['斯普拉射击枪'] }],
  facts: [{ label: '规则', value: '占地' }],
  action: { label: '查看日程截图', url: 'https://example.com/schedules.png' },
})

const denseNotification = createNotification({
  id: 'schedules',
  source: { name: '来源'.repeat(200), iconUrl: 'https://example.com/icon.png' },
  title: '日程已更新'.repeat(100),
  subtitle: '02:00 - 04:00 '.repeat(400),
  image: {
    url: 'https://example.com/schedules.png',
    alt: '对战日程'.repeat(200),
    width: 1024,
    height: 576,
    aspectRatio: 1024 / 576,
  },
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
const lineNotification = createNotification({
  ...notification,
  image: { ...notification.image, url: 'https://example.com/schedules.png' },
})
const denseLineNotification = createNotification({
  ...denseNotification,
  image: { ...denseNotification.image, url: 'https://example.com/schedules.png' },
})
const validImageMetadata = Object.freeze({ format: 'png', width: 1024, height: 576, bytes: 800_000 })

function response(value, status = 200, headers = {}) {
  return new Response(value == null ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
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
  assert.match(messagePayload.markdown.content, /#1024px #576px/)
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

test('QQ isolates cached tokens by credential boundaries and token endpoint', async () => {
  const tokenRequests = []
  const messageAuthorizations = []
  const targets = [
    {
      name: 'first',
      appId: 'cache:boundary',
      clientSecret: 'secret',
      tokenUrl: 'https://auth.example.com/token-one',
    },
    {
      name: 'second',
      appId: 'cache',
      clientSecret: 'boundary:secret',
      tokenUrl: 'https://auth.example.com/token-one',
    },
    {
      name: 'third',
      appId: 'cache:boundary',
      clientSecret: 'secret',
      tokenUrl: 'https://auth.example.com/token-two',
    },
  ]

  for (const [index, target] of targets.entries()) {
    await deliverQQ(
      notification,
      { ...target, targetType: 'group', targetId: `group-${index}` },
      {
        fetchImpl: async (url, options) => {
          if (String(url).startsWith('https://auth.example.com/')) {
            tokenRequests.push(String(url))
            return response({ access_token: `token-${index}`, expires_in: '7200' })
          }
          messageAuthorizations.push(options.headers.Authorization)
          return response({ id: `message-${index}` })
        },
      }
    )
  }

  assert.deepEqual(tokenRequests, [
    'https://auth.example.com/token-one',
    'https://auth.example.com/token-one',
    'https://auth.example.com/token-two',
  ])
  assert.deepEqual(messageAuthorizations, ['QQBot token-0', 'QQBot token-1', 'QQBot token-2'])
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

test('Slack uses accessible Block Kit without callback-dependent controls', async () => {
  let payload
  await deliverSlack(notification, { name: 'team', webhookUrl: 'https://hooks.slack.com/services/T/B/key' }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return new Response('ok', { status: 200 })
    },
  })

  assert.match(payload.text, /日程已更新/)
  assert.equal(payload.blocks[0].type, 'header')
  assert.equal(payload.blocks[2].type, 'image')
  assert.equal(payload.blocks[2].image_url, notification.image.url)
  assert.equal(payload.blocks.find((block) => block.fields)?.fields.length, 1)
  assert.match(payload.blocks.at(-1).text.text, /\*<https:\/\/example\.com\/schedules\.png\|查看日程截图 ↗>\*/)
  assert.ok(
    payload.blocks
      .flatMap((block) => [block.text, ...(block.elements || []), ...(block.fields || [])])
      .filter((text) => text?.type === 'mrkdwn')
      .every((text) => text.verbatim === true)
  )
  assert.equal(JSON.stringify(payload).includes('"type":"button"'), false)
  assert.equal(JSON.stringify(payload).includes('action_id'), false)
})

test('Slack escapes fallback text that could be interpreted as control markup', async () => {
  let payload
  await deliverSlack(
    createNotification({
      ...notification,
      title: '特殊 <@U123> & 标题',
    }),
    { name: 'team', webhookUrl: 'https://hooks.slack.com/services/T/B/key' },
    {
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body)
        return new Response('ok', { status: 200 })
      },
    }
  )

  assert.match(payload.text, /&lt;@U123&gt; &amp;/)
  assert.doesNotMatch(payload.text, /<@U123>/)
})

test('Slack percent-encodes link delimiters in action URLs', async () => {
  let payload
  await deliverSlack(
    createNotification({
      ...notification,
      action: { ...notification.action, url: 'https://example.com/screenshots/a|b.png' },
    }),
    { name: 'team', webhookUrl: 'https://hooks.slack.com/services/T/B/key' },
    {
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body)
        return new Response('ok', { status: 200 })
      },
    }
  )

  assert.match(payload.blocks.at(-1).text.text, /a%7Cb\.png\|/)
})

test('Slack obeys Block Kit budgets and Retry-After', async () => {
  let payload
  const waits = []
  let attempt = 0
  await deliverSlack(denseNotification, { name: 'dense', webhookUrl: 'https://hooks.slack.com/services/T/B/key' }, {
    waitImpl: async (delayMs) => waits.push(delayMs),
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      attempt += 1
      return attempt === 1
        ? new Response('rate_limited', { status: 429, headers: { 'retry-after': '2' } })
        : new Response('ok', { status: 200 })
    },
  })

  assert.deepEqual(waits, [2_000])
  assert.ok(payload.blocks.length <= 50)
  assert.ok(payload.blocks.filter((block) => block.type === 'section').every((block) => !block.text || block.text.text.length <= 3_000))
  assert.ok(payload.blocks.flatMap((block) => block.fields || []).every((field) => field.text.length <= 2_000))
})

test('Slack budgets escaped mrkdwn without splitting entities', async () => {
  let payload
  const escapedNotification = createNotification({
    ...notification,
    source: { ...notification.source, name: '&'.repeat(500) },
    subtitle: '&'.repeat(500),
    sections: [{ title: '&'.repeat(200), text: '&'.repeat(1_200), listItems: ['&'.repeat(200)] }],
    facts: [{ label: '&'.repeat(100), value: '&'.repeat(500) }],
  })
  await deliverSlack(
    escapedNotification,
    { name: 'team', webhookUrl: 'https://hooks.slack.com/services/T/B/key' },
    {
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body)
        return new Response('ok', { status: 200 })
      },
    }
  )

  const contextText = payload.blocks[1].elements[1].text
  const sectionTextValue = payload.blocks.find((block) => block.text?.type === 'mrkdwn').text.text
  const factText = payload.blocks.find((block) => block.fields).fields[0].text
  assert.ok(Array.from(payload.text).length <= 4_000)
  assert.ok(Array.from(contextText).length <= 3_000)
  assert.ok(Array.from(sectionTextValue).length <= 3_000)
  assert.ok(Array.from(factText).length <= 2_000)
  for (const text of [payload.text, contextText, sectionTextValue, factText]) {
    assert.equal(text.replaceAll('&amp;', '').includes('&'), false, text.slice(-20))
  }
})

test('Slack requires the official success token and webhook URL shape', async () => {
  for (const responseBody of ['invalid_payload', 'ok\n', ' ok ']) {
    await assert.rejects(
      deliverSlack(notification, { name: 'team', webhookUrl: 'https://hooks.slack.com/services/T/B/key' }, {
        fetchImpl: async () => new Response(responseBody, { status: 200 }),
      }),
      /rejected the notification/
    )
  }

  assert.equal(
    slackTargetSchema.safeParse({
      name: 'gov-team',
      webhookUrl: 'https://hooks.slack-gov.com/services/T/B/key',
    }).success,
    true
  )
  for (const webhookUrl of [
    'http://hooks.slack.com/services/T/B/key',
    'https://example.com/services/T/B/key',
    'https://hooks.slack.com/not-services/T/B/key',
    'https://hooks.slack.com/services/T/B/key?redirect=1',
    'https://hooks.slack.com:444/services/T/B/key',
    'https://hooks.slack.com/services/T/B/key%2Fextra',
  ]) {
    assert.equal(slackTargetSchema.safeParse({ name: 'invalid', webhookUrl }).success, false, webhookUrl)
  }

  await assert.rejects(
    deliverSlack(
      createNotification({
        ...notification,
        action: { ...notification.action, url: `https://example.com/${'a'.repeat(3_000)}` },
      }),
      { name: 'team', webhookUrl: 'https://hooks.slack.com/services/T/B/key' },
      { fetchImpl: async () => new Response('ok', { status: 200 }) }
    ),
    /action URL exceeds the 3000 character mrkdwn limit/
  )
})

test('LINE uses an uncropped Flex bubble and a stable retry key', async () => {
  const expectedRetryUuid = '07820c6b-df31-4a10-8270-dd7cd0396535'
  let payload
  let requestOptions
  await deliverLine(
    lineNotification,
    {
      name: 'personal',
      channelAccessToken: 'channel-access-token',
      targetType: 'user',
      targetId: 'U0123456789abcdef0123456789abcdef',
    },
    {
      retryKey: expectedRetryUuid,
      inspectImage: async () => validImageMetadata,
      fetchImpl: async (_url, options) => {
        requestOptions = options
        payload = JSON.parse(options.body)
        return response({})
      },
    }
  )

  const bubble = payload.messages[0].contents
  assert.equal(payload.to, 'U0123456789abcdef0123456789abcdef')
  assert.equal(requestOptions.headers.Authorization, 'Bearer channel-access-token')
  assert.equal(requestOptions.headers['X-Line-Retry-Key'], expectedRetryUuid)
  assert.equal(bubble.header.backgroundColor, '#FF5A36')
  assert.equal(bubble.hero.url, lineNotification.image.url)
  assert.equal(bubble.hero.aspectMode, 'fit')
  assert.equal(bubble.hero.action.type, 'uri')
  assert.equal(bubble.footer.contents[0].action.uri, notification.action.url)
  assert.ok(Buffer.byteLength(JSON.stringify(bubble)) <= 30_000)
})

test('LINE trims dense Flex content and validates typed targets', async () => {
  let payload
  await deliverLine(
    denseLineNotification,
    {
      name: 'dense',
      channelAccessToken: 'channel-access-token',
      targetType: 'group',
      targetId: 'C0123456789abcdef0123456789abcdef',
    },
    {
      inspectImage: async () => validImageMetadata,
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body)
        return response({})
      },
    }
  )

  assert.ok(Buffer.byteLength(JSON.stringify(payload.messages[0].contents)) <= 30_000)
  assert.equal(
    lineTargetSchema.safeParse({
      name: 'wrong-type',
      channelAccessToken: 'token',
      targetType: 'room',
      targetId: 'U0123456789abcdef0123456789abcdef',
    }).success,
    false
  )
})

test('LINE exposes request IDs from rejected push requests', async () => {
  await assert.rejects(
    deliverLine(
      lineNotification,
      {
        name: 'personal',
        channelAccessToken: 'invalid',
        targetType: 'user',
        targetId: 'U0123456789abcdef0123456789abcdef',
      },
      {
        inspectImage: async () => validImageMetadata,
        fetchImpl: async () =>
          response({ message: 'invalid request' }, 400, { 'x-line-request-id': 'line-request-id' }),
      }
    ),
    /LINE request line-request-id/
  )
})

test('LINE treats an accepted retry-key duplicate as fulfilled', async () => {
  const result = await deliverLine(
    lineNotification,
    {
      name: 'personal',
      channelAccessToken: 'token',
      targetType: 'user',
      targetId: 'U0123456789abcdef0123456789abcdef',
    },
    {
      inspectImage: async () => validImageMetadata,
      fetchImpl: async () =>
        response(
          { message: 'retry key already accepted' },
          409,
          { 'x-line-accepted-request-id': 'accepted-request-id' }
        ),
    }
  )

  assert.deepEqual(result, {
    status: 409,
    duplicate: true,
    acceptedRequestId: 'accepted-request-id',
  })
})

test('LINE rejects real image metadata outside platform limits', async () => {
  await assert.rejects(
    deliverLine(
      lineNotification,
      {
        name: 'personal',
        channelAccessToken: 'token',
        targetType: 'user',
        targetId: 'U0123456789abcdef0123456789abcdef',
      },
      {
        inspectImage: async () => ({ ...validImageMetadata, width: 1025 }),
        fetchImpl: async () => response({}),
      }
    ),
    /exceeding the 1024x1024 limit/
  )
})

test('LINE bounds remote image downloads to its platform limit', async () => {
  let inspectionOptions
  await deliverLine(
    lineNotification,
    {
      name: 'personal',
      channelAccessToken: 'token',
      targetType: 'user',
      targetId: 'U0123456789abcdef0123456789abcdef',
    },
    {
      inspectImage: async (_url, options) => {
        inspectionOptions = options
        return validImageMetadata
      },
      fetchImpl: async () => response({}),
    }
  )

  assert.equal(inspectionOptions.maximumBytes, 10 * 1024 * 1024)
})

test('WhatsApp uses the approved media-template contract', async () => {
  let payload
  let requestedUrl
  let requestOptions
  await deliverWhatsApp(
    notification,
    {
      name: 'personal',
      accessToken: 'EAA-token',
      phoneNumberId: '123456789012345',
      recipientPhoneNumber: '8613800000000',
      templateName: 'splatoon_notification',
      languageCode: 'zh_CN',
    },
    {
      assetBaseUrl: 'https://example.com',
      inspectImage: async () => validImageMetadata,
      fetchImpl: async (url, options) => {
        requestedUrl = String(url)
        requestOptions = options
        payload = JSON.parse(options.body)
        return response({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] })
      },
    }
  )

  assert.equal(whatsAppGraphApiVersion, 'v25.0')
  assert.match(requestedUrl, /graph\.facebook\.com\/v25\.0\/123456789012345\/messages$/)
  assert.equal(requestOptions.headers.Authorization, 'Bearer EAA-token')
  assert.equal(payload.type, 'template')
  assert.equal(payload.template.components[0].parameters[0].image.link, notification.image.url)
  assert.deepEqual(
    payload.template.components[1].parameters.map(({ parameter_name }) => parameter_name),
    ['title', 'context', 'details']
  )
  assert.deepEqual(payload.template.components[2].parameters[0], {
    type: 'text',
    parameter_name: 'action_path',
    text: 'schedules.png',
  })
})

test('WhatsApp bounds remote image downloads to its smaller media limit', async () => {
  let inspectionOptions
  await deliverWhatsApp(
    notification,
    {
      name: 'personal',
      accessToken: 'token',
      phoneNumberId: '123456789012345',
      recipientPhoneNumber: '8613800000000',
      templateName: 'splatoon_notification',
      languageCode: 'zh_CN',
    },
    {
      assetBaseUrl: 'https://example.com',
      inspectImage: async (_url, options) => {
        inspectionOptions = options
        return validImageMetadata
      },
      fetchImpl: async () => response({ messages: [{ id: 'wamid.limit' }] }),
    }
  )

  assert.equal(inspectionOptions.maximumBytes, 5 * 1024 * 1024)
})

test('WhatsApp retries transient Meta errors and requires an accepted message ID', async () => {
  const target = {
    name: 'personal',
    accessToken: 'EAA-token',
    phoneNumberId: '123456789012345',
    recipientPhoneNumber: '8613800000000',
    templateName: 'splatoon_notification',
    languageCode: 'zh_CN',
  }
  const waits = []
  let attempt = 0
  await deliverWhatsApp(notification, target, {
    assetBaseUrl: 'https://example.com',
    inspectImage: async () => validImageMetadata,
    waitImpl: async (delayMs) => waits.push(delayMs),
    fetchImpl: async () => {
      attempt += 1
      return attempt === 1
        ? response({ error: { message: 'temporarily unavailable', is_transient: true } }, 400)
        : response({ messages: [{ id: 'wamid.2' }] })
    },
  })
  assert.deepEqual(waits, [500])

  await assert.rejects(
    deliverWhatsApp(notification, target, {
      assetBaseUrl: 'https://example.com',
      inspectImage: async () => validImageMetadata,
      fetchImpl: async () => response({ messaging_product: 'whatsapp', messages: [] }),
    }),
    /rejected the notification/
  )
})

test('WhatsApp keeps named template parameters within their Unicode budgets', async () => {
  let payload
  await deliverWhatsApp(
    denseNotification,
    {
      name: 'dense',
      accessToken: 'token',
      phoneNumberId: '123456789012345',
      recipientPhoneNumber: '8613800000000',
      templateName: 'splatoon_notification',
      languageCode: 'zh_CN',
    },
    {
      assetBaseUrl: 'https://example.com',
      inspectImage: async () => validImageMetadata,
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body)
        return response({ messages: [{ id: 'wamid.dense' }] })
      },
    }
  )

  const parameters = Object.fromEntries(
    payload.template.components[1].parameters.map(({ parameter_name, text }) => [parameter_name, text])
  )
  assert.ok(Array.from(parameters.title).length <= 120)
  assert.ok(Array.from(parameters.context).length <= 160)
  assert.ok(Array.from(parameters.details).length <= 560)
  assert.doesNotMatch(parameters.details, /\t| {2,}/)
})

test('WhatsApp fails closed on invalid recipients and template URL prefixes', async () => {
  assert.equal(
    whatsAppTargetSchema.safeParse({
      name: 'invalid',
      accessToken: 'token',
      phoneNumberId: '123',
      recipientPhoneNumber: '+8613800000000',
      templateName: 'Splatoon Notification',
      languageCode: 'zh-CN',
    }).success,
    false
  )

  await assert.rejects(
    deliverWhatsApp(
      notification,
      {
        name: 'personal',
        accessToken: 'token',
        phoneNumberId: '123',
        recipientPhoneNumber: '8613800000000',
        templateName: 'splatoon_notification',
        languageCode: 'zh_CN',
      },
      {
        assetBaseUrl: 'https://cdn.example.com',
        inspectImage: async () => validImageMetadata,
        fetchImpl: async () => response({}),
      }
    ),
    /approved template prefix/
  )
})

test('WhatsApp classifies Meta throughput and configuration errors by code and details', async () => {
  const target = {
    name: 'personal',
    accessToken: 'token',
    phoneNumberId: '123456789012345',
    recipientPhoneNumber: '8613800000000',
    templateName: 'splatoon_notification',
    languageCode: 'zh_CN',
  }
  let attempts = 0
  await deliverWhatsApp(notification, target, {
    assetBaseUrl: 'https://example.com',
    inspectImage: async () => validImageMetadata,
    waitImpl: async () => {},
    fetchImpl: async () => {
      attempts += 1
      return attempts === 1
        ? response({ error: { code: 130429, error_data: { details: 'Throughput reached' } } }, 400)
        : response({ messages: [{ id: 'wamid.retry' }] })
    },
  })
  assert.equal(attempts, 2)

  attempts = 0
  await assert.rejects(
    deliverWhatsApp(notification, target, {
      assetBaseUrl: 'https://example.com',
      inspectImage: async () => validImageMetadata,
      waitImpl: async () => {},
      fetchImpl: async () => {
        attempts += 1
        return response({ error: { code: 132001, error_data: { details: 'Template is not approved' } } }, 400)
      },
    }),
    /Meta code 132001: Template is not approved/
  )
  assert.equal(attempts, 1)
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
    ['whatsapp', 'BOT_WHATSAPP_CONFIG'],
    ['line', 'BOT_LINE_CONFIG'],
    ['slack', 'BOT_SLACK_CONFIG'],
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
