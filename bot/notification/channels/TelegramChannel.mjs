import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'
import { compactText, escapeHtml } from '../format.mjs'

export const telegramTargetSchema = z.object({
  name: z.string().min(1),
  botToken: z.string().min(1),
  chatId: z.union([z.string().min(1), z.number().int()]),
  messageThreadId: z.number().int().positive().optional(),
  disableNotification: z.boolean().optional(),
}).strict()

const maximumCaptionLength = 1024

function htmlText(value, maximumLength) {
  return escapeHtml(compactText(value, maximumLength))
}

function sectionBlock(section) {
  const details = [
    section.text ? htmlText(section.text, 300) : null,
    ...section.listItems.slice(0, 8).map((item) => `• ${htmlText(item, 120)}`),
  ].filter(Boolean)
  return [`<b>${htmlText(section.title, 120)}</b>`, ...details].join('\n')
}

function fitCaptionBlocks(blocks) {
  const includedBlocks = []
  const overflowNotice = '<i>更多内容请点击下方按钮查看</i>'

  for (const block of blocks) {
    const candidate = [...includedBlocks, block].join('\n\n')
    if (candidate.length <= maximumCaptionLength) {
      includedBlocks.push(block)
      continue
    }

    const withOverflowNotice = [...includedBlocks, overflowNotice].join('\n\n')
    if (withOverflowNotice.length <= maximumCaptionLength) {
      includedBlocks.push(overflowNotice)
    }
    break
  }

  return includedBlocks.join('\n\n')
}

function createCaption(notification) {
  const blocks = [
    `<b>${htmlText(notification.title, 180)}</b>`,
    notification.subtitle ? `<blockquote>${htmlText(notification.subtitle, 240)}</blockquote>` : null,
    `<i>🦑 ${htmlText(notification.source.name, 160)}</i>`,
    ...notification.facts.map(
      (fact) => `• <b>${htmlText(fact.label, 80)}</b>\n${htmlText(fact.value, 240)}`
    ),
    ...notification.sections.map(sectionBlock),
  ].filter(Boolean)

  return fitCaptionBlocks(blocks)
}

export async function deliverTelegram(notification, target, options = {}) {
  const payload = {
    chat_id: target.chatId,
    photo: notification.image.url,
    caption: createCaption(notification),
    parse_mode: 'HTML',
    show_caption_above_media: true,
    disable_notification: target.disableNotification ?? false,
    ...(target.messageThreadId ? { message_thread_id: target.messageThreadId } : {}),
    reply_markup: {
      inline_keyboard: [
        [{ text: compactText(`🖼️ ${notification.action.label}`, 64), url: notification.action.url }],
      ],
    },
  }
  const result = await jsonRequest(
    {
      url: `https://api.telegram.org/bot${target.botToken}/sendPhoto`,
      fetchImpl: options.fetchImpl,
      label: `Telegram target ${target.name}`,
    },
    payload
  )

  return requireJsonSuccess(result, (body) => body.ok === true, `Telegram target ${target.name}`)
}
