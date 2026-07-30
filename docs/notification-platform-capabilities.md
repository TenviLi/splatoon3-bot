# Notification Platform Capabilities

Research date: 2026-07-31

This note compares platform-native rich-message options for the notification adapters. The default recommendations deliberately avoid interaction callbacks, platform-side state, manual template approval, and extra media-upload credentials unless explicitly noted.

## Recommended Direction

| Platform | Default presentation | Safe primary action | Recommended change |
| --- | --- | --- | --- |
| Discord | One image-rich embed | Clickable embed title | Keep the embed; improve field grouping, text budgets, and metadata |
| Telegram | `sendPhoto` with formatted caption | URL inline-keyboard button | Keep the current structure; make caption truncation entity-safe |
| QQ | Custom Markdown for group/user; capability-aware fallback for channels | Markdown link | Do not depend on keyboards; fix image dimensions and split behavior by target type |
| Feishu/Lark | Card schema 2.0 | `open_url` button behavior | Migrate from the legacy card shape; keep remote screenshot as a link unless app credentials are added |
| DingTalk | `actionCard` | `singleURL` or URL-only `btns` | Keep ActionCard for individual notifications; reserve FeedCard for digests |

Across adapters, preserve the common `Notification` model but add adapter-owned layout and length budgets. A single universal text renderer would discard the strongest native features of each platform.

## Discord Incoming Webhooks

### Official capabilities

- Execute Webhook accepts message content, embeds, components, files/attachments, and polls. The `wait=true` query makes Discord return the created message, which is useful for delivery verification. [Execute Webhook](https://discord.com/developers/docs/resources/webhook#execute-webhook)
- A webhook message can contain up to 10 embeds. An embed supports author, title and URL, description, color, image, thumbnail, footer, timestamp, and fields. [Embed object](https://discord.com/developers/docs/resources/message#embed-object)
- Important embed limits include 256 characters for the title, 4096 for the description, 25 fields, 256 for a field name, 1024 for a field value, and 6000 aggregate characters across all embeds in one message. [Embed limits](https://discord.com/developers/docs/resources/message#embed-object-embed-limits)
- Discord components have webhook/application ownership and interaction semantics that are more complex than embeds. Link-style components do not require an application callback, but the webhook compatibility rules are not as universal as embeds. They are therefore not a default dependency for this project. [Execute Webhook](https://discord.com/developers/docs/resources/webhook#execute-webhook)

### Adapter recommendation

Keep one embed per Splatoon notification:

- Use `author` for the source identity and `thumbnail` for its icon.
- Keep the large schedule screenshot in `image`.
- Keep the title URL as the zero-callback primary action; use footer for a short source/status label rather than repeating the action text.
- Render sections as full-width fields and facts as inline fields, but group facts in rows of two or three so mobile rendering remains readable.
- Budget the whole embed against the 6000-character aggregate limit, not only each individual field.
- Add an optional ISO timestamp to the domain model only if the notification has a meaningful update time; do not use the workflow execution time as misleading content metadata.
- Do not add interactive buttons by default. A future optional link button must be feature-gated and tested against ordinary incoming webhooks.

Safe payload shape:

```js
{
  embeds: [{
    author: { name, icon_url },
    title,
    url,
    description,
    color,
    thumbnail: { url: iconUrl },
    image: { url: screenshotUrl },
    fields: [...sections, ...facts],
    footer: { text: sourceLabel }
  }]
}
```

## Telegram Bot API

### Official capabilities

- `sendPhoto` accepts a public HTTP URL, Telegram `file_id`, or uploaded file. It supports a caption, `parse_mode` or explicit caption entities, `show_caption_above_media`, silent delivery, forum topic targeting, content protection, and reply markup. [sendPhoto](https://core.telegram.org/bots/api#sendphoto)
- The rendered caption is limited to 0-1024 characters after entity parsing. Photos are limited to 10 MB; width plus height must not exceed 10000, and the width-to-height ratio must not exceed 20. [sendPhoto](https://core.telegram.org/bots/api#sendphoto)
- HTML formatting is intentionally limited to Telegram's documented tags and requires escaping raw `<`, `>` and `&`. [Formatting options](https://core.telegram.org/bots/api#formatting-options)
- An inline keyboard URL button opens a URL and needs no callback handler. `callback_data`, web-app, login, payment, and game buttons introduce additional interaction or trust requirements and should not be used here. [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton)

### Adapter recommendation

The current photo-first layout is already the best native fit:

- Keep `show_caption_above_media: true` so the title and time context are visible before the screenshot.
- Keep one URL button. A second button is only justified when the domain model gains a genuinely different destination.
- Replace raw string truncation of HTML with structured budgeting or `caption_entities`. Truncating a serialized HTML caption can cut a closing tag and cause Telegram to reject the entire request.
- Reserve space for the action context and the most important facts before lower-priority sections; 1024 characters is a hard presentation constraint.
- Validate image byte size and dimensions in screenshot verification because a syntactically valid URL can still be rejected by `sendPhoto`.
- Do not use callback buttons, menus, or stateful navigation for scheduled one-way notifications.

Safe payload shape:

```js
{
  chat_id,
  photo: screenshotUrl,
  caption,
  parse_mode: "HTML",
  show_caption_above_media: true,
  reply_markup: {
    inline_keyboard: [[{ text: actionLabel, url: actionUrl }]]
  }
}
```

## QQ Official Bot

### Official capabilities

- QQ separates text (`msg_type=0`), Markdown (`msg_type=2`), structured/ARK messages (`msg_type=3` where supported), and uploaded rich media (`msg_type=7`). Rich media must first be uploaded to obtain time-limited `file_info`; group and user upload scopes are separate. [Message overview](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html) [Rich media](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/rich-media.html)
- The official Markdown documentation states that, as of 2026-04-23, custom Markdown is open to all bots for direct-message and group scenarios without a Markdown template. Channel custom Markdown remains invitation-gated. Public image URLs in Markdown are downloaded and re-hosted by the platform. [Markdown messages](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html)
- ARK is a platform-native structured card system. Template 23 is a link/text list and template 24 is a text/thumbnail card with title, description, image, link, and source fields. [Structured card messages](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/ark.html)
- Embed messages are channel-only. They support a prompt, title, thumbnail, and fields, but are not a common group/user solution. [Embed messages](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/embed.html)
- Message keyboards can provide URL-jump, callback, or command buttons. Official docs mark button templates as application-gated and custom buttons as invitation-gated; custom layouts allow up to five rows with five buttons per row. [Message buttons](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/msg-btn.html)

### Adapter recommendation

Use target-type-aware rendering instead of pretending QQ has one uniform rich-message surface:

- `group` and `user`: keep custom Markdown, which is now the least stateful rich option. Use one screenshot, concise headings, facts, and one ordinary Markdown link.
- `channel`: prefer a channel Embed when custom Markdown capability is unavailable. The adapter configuration should expose an explicit capability choice rather than silently assuming the invitation-gated feature.
- Fix screenshot dimension metadata. For a 16:9 screenshot the Markdown dimensions should follow the real orientation, for example `#1200px #675px`, not a portrait-shaped pair.
- Do not enable keyboards by default. Even a URL-only button depends on platform enablement that a repository Secret cannot prove.
- Do not switch the default to uploaded rich media: it adds an upload request, expiring `file_info`, and separate caches/scopes for group and user delivery.
- ARK template 24 is a promising card fallback, but the official pages are not fully consistent about `msg_type=3` support across generated group/user endpoint tables. Do not adopt it as a universal default until fixture tests cover each target type against a real sandbox.

Safe default payload for group/user:

```js
{
  msg_type: 2,
  markdown: {
    content: "# Title\n\n![alt #1200px #675px](image-url)\n\n[View screenshot](url)"
  }
}
```

## Feishu / Lark Custom Bot

### Official capabilities

- A custom bot uses a group-scoped webhook and supports text, rich text, images, group cards, and message cards. Its limit is 100 requests per minute and 5 requests per second per tenant and bot; the request body must not exceed 20 KB. [Custom bot guide](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)
- The official guide now demonstrates card schema 2.0 with header templates, Markdown, layout styles, and button `open_url` behaviors. A card can be generated with the official card builder. [Custom bot guide: cards](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot#537)
- Cards sent by a custom bot only support URL navigation through buttons or text links. They do not support server-side interaction callbacks. This is a good match for this project's one-way notification model. [Custom bot guide: card limitations](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot#539)
- Feishu image messages and card image elements use an `image_key`. The image upload API that creates the key belongs to authenticated app capabilities; a webhook URL alone cannot turn the existing public screenshot URL into an `image_key`. [Custom bot guide: images](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot#485) [Upload image](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/image/create)

### Adapter recommendation

Migrate the current legacy card object to card schema 2.0:

- Use the notification accent to select a small semantic header-template palette (`turquoise`, `orange`, `yellow`, etc.) rather than hard-coding every notification to orange.
- Use one Markdown element for subtitle/source, separate Markdown blocks for sections, and a two-column or field-like layout for short facts.
- Use a single `open_url` button as the primary action. It is officially supported for custom bots and requires no callback service.
- Keep the screenshot represented by an explanatory note plus the URL action while the adapter is webhook-only.
- If inline screenshots are important, introduce a separate Feishu app-backed target type with app credentials, upload/cache the image, and place its `image_key` in the card. Do not overload the custom-webhook target with hidden authentication requirements.
- Keep the serialized card under 20 KB and test the exact JSON byte length, not JavaScript character count.

Safe webhook-only card direction:

```js
{
  msg_type: "interactive",
  card: {
    schema: "2.0",
    header: { title: { tag: "plain_text", content: title }, template },
    body: {
      direction: "vertical",
      elements: [
        { tag: "markdown", content: summary },
        { tag: "markdown", content: details },
        {
          tag: "button",
          text: { tag: "plain_text", content: actionLabel },
          behaviors: [{ type: "open_url", default_url: actionUrl }]
        }
      ]
    }
  }
}
```

## DingTalk Custom Robot

### Official capabilities

- Custom robots send to a group through a webhook and can use keyword, IP, or signature security. [Custom robot access](https://open.dingtalk.com/document/robots/custom-robot-access)
- The official custom-robot message formats include text, link, Markdown, ActionCard, and FeedCard. ActionCard supports Markdown content and either one overall URL action or multiple URL buttons; FeedCard is a list of image/title/link items. [Robot message types](https://open.dingtalk.com/document/development/robot-message-type)
- A custom robot can send at most 20 messages per minute to its group. Exceeding the limit throttles it for 10 minutes; DingTalk recommends combining high-volume information into a Markdown summary. [Custom bot group messages](https://open.dingtalk.com/document/orgapp/custom-bot-to-send-group-chat-messages)
- URL actions are ordinary client navigation and do not require an outgoing-robot callback. Outgoing mode is a separate optional feature and is unnecessary for these notifications. [Custom robot access](https://open.dingtalk.com/document/robots/custom-robot-access)

### Adapter recommendation

The current ActionCard is the strongest safe default for one notification:

- Keep the large public screenshot inside ActionCard Markdown and the single URL action below it.
- Strengthen visual hierarchy with a compact title, a quoted source/time line, the image, section headings, and short facts. DingTalk has no Discord-style arbitrary accent-color field, so use restrained emoji and ordering rather than fake color markup.
- Use multi-button `btns` only after the domain model contains multiple distinct URL actions. URL-only buttons are safe; callback-style interaction is out of scope.
- Use FeedCard only for an optional digest that combines several notifications into one message. It is less suitable for the detailed schedule screenshot but can reduce rate-limit pressure.
- Add a conservative local text budget and tests. The current official pages are dynamically rendered and their exact per-field length table was not reliably available during this research, so no unverified numeric field limits should be encoded from secondary sources.

Safe individual payload:

```js
{
  msgtype: "actionCard",
  actionCard: {
    title,
    text: markdownWithPublicImage,
    btnOrientation: "0",
    singleTitle: actionLabel,
    singleURL: actionUrl
  }
}
```

## Implementation Priorities

1. Make text budgeting structured and adapter-specific, especially Telegram HTML and Discord's aggregate embed limit.
2. Move Feishu to card schema 2.0 with semantic header colors and a URL-only button.
3. Make QQ rendering target-type-aware; fix screenshot dimensions and add a channel Embed fallback.
4. Refine Discord field grouping, thumbnail/footer usage, and mobile readability without adding component dependencies.
5. Keep DingTalk ActionCard, but add an optional digest/FeedCard path only if notification volume grows.
6. Add payload golden tests per adapter and notification type. These should assert platform limits, escaped content, URL-only actions, and absence of callback identifiers.

## Official-Documentation Access Notes

- Discord and Telegram documentation was directly accessible from their official developer sites.
- QQ official pages were directly accessible. The 2026-04-23 custom-Markdown update is current relative to this research date, but QQ's overview and generated endpoint tables are not perfectly consistent about universal ARK support; the recommendation intentionally avoids relying on that uncertainty.
- Feishu's official custom-bot guide was directly accessible in its first-party Markdown representation.
- DingTalk's official documentation is dynamically rendered. The message-type names, webhook model, and rate limit were verified from official rendered pages, but exact field-length limits were not reliably extractable; this note intentionally omits them rather than citing unofficial values.
