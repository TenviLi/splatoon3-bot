import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'

export const wecomTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
}).strict()

export const weComMessageBudget = Object.freeze({ verticalItems: 4, horizontalItems: 6 })

function resolveMessageBudget(options) {
  return { ...weComMessageBudget, ...options.capabilities?.messageBudget }
}

export async function deliverWeCom(notification, target, options = {}) {
  const messageBudget = resolveMessageBudget(options)
  const sectionItems = notification.sections.flatMap((section) =>
    section.listItems.map((item) => ({ keyname: '-', value: item }))
  )
  const payload = {
    msgtype: 'template_card',
    template_card: {
      card_type: 'news_notice',
      source: {
        icon_url: notification.source.iconUrl,
        desc: notification.source.name,
        desc_color: 0,
      },
      main_title: {
        title: notification.title,
        ...(notification.subtitle ? { desc: notification.subtitle } : {}),
      },
      card_image: {
        url: notification.image.url,
        aspect_ratio: notification.image.aspectRatio,
      },
      vertical_content_list: notification.sections.slice(0, messageBudget.verticalItems).map((section) => ({
        title: section.title,
        ...(section.text ? { desc: section.text } : {}),
      })),
      horizontal_content_list: [
        ...sectionItems,
        ...notification.facts.map((fact) => ({ keyname: fact.label, value: fact.value })),
      ].slice(0, messageBudget.horizontalItems),
      card_action: {
        type: 1,
        url: notification.action.url,
      },
    },
  }
  const result = await jsonRequest(
    {
      url: target.webhookUrl,
      fetchImpl: options.fetchImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `WeCom target ${target.name}`,
    },
    payload
  )

  return requireJsonSuccess(result, (body) => body.errcode === 0, `WeCom target ${target.name}`)
}

export async function deliverWeComDigest(notifications, target, options = {}) {
  const maximumItems = options.capabilities?.digest.maximumItemsPerDelivery || 10
  const { verticalItems, horizontalItems } = resolveMessageBudget(options)
  if (notifications.length > maximumItems) {
    throw new Error(`WeCom Digest delivery exceeds the ${maximumItems}-item Template Card limit`)
  }
  const first = notifications[0]
  const payload = {
    msgtype: 'template_card',
    template_card: {
      card_type: 'news_notice',
      source: {
        icon_url: first.source.iconUrl,
        desc: 'Splatoon 3',
        desc_color: 0,
      },
      main_title: {
        title: `🦑 Splatoon 3 · ${notifications.length}`,
        desc: notifications.map(({ title }) => title).join(' · '),
      },
      card_image: {
        url: first.image.url,
        aspect_ratio: first.image.aspectRatio,
      },
      vertical_content_list: notifications.slice(0, verticalItems).map((notification) => ({
        title: notification.title,
        desc: [notification.source.name, notification.subtitle].filter(Boolean).join(' · '),
      })),
      horizontal_content_list: notifications
        .slice(verticalItems, verticalItems + horizontalItems)
        .map((notification) => ({
          keyname: notification.source.name,
          value: notification.title,
          type: 1,
          url: notification.action.url,
        })),
      card_action: {
        type: 1,
        url: first.action.url,
      },
    },
  }
  const result = await jsonRequest(
    {
      url: target.webhookUrl,
      fetchImpl: options.fetchImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `WeCom digest target ${target.name}`,
    },
    payload
  )
  return requireJsonSuccess(result, (body) => body.errcode === 0, `WeCom digest target ${target.name}`)
}
