import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'

export const wecomTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
}).strict()

export async function deliverWeCom(notification, target, options = {}) {
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
      vertical_content_list: notification.sections.slice(0, 4).map((section) => ({
        title: section.title,
        ...(section.text ? { desc: section.text } : {}),
      })),
      horizontal_content_list: notification.facts.slice(0, 6).map((fact) => ({
        keyname: fact.label,
        value: fact.value,
      })),
      card_action: {
        type: 1,
        url: notification.action.url,
      },
    },
  }
  const result = await jsonRequest(
    { url: target.webhookUrl, fetchImpl: options.fetchImpl, label: `WeCom target ${target.name}` },
    payload
  )

  return requireJsonSuccess(result, (body) => body.errcode === 0, `WeCom target ${target.name}`)
}
