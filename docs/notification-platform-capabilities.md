# Notification Platform Capabilities

Research date: 2026-07-31

This note compares platform-native rich-message options for the notification adapters. The default recommendations deliberately avoid interaction callbacks, platform-side state, and extra media-upload credentials unless explicitly noted. WhatsApp is the intentional exception: compliant proactive delivery requires user opt-in and an approved message template.

## Recommended Direction

| Platform | Default presentation | Safe primary action | Recommended change |
| --- | --- | --- | --- |
| WeCom | `news_notice` Template Card | Whole-card URL action | Keep the card; use built-in content-addressed icons and concise native sections |
| Discord | One image-rich embed | Clickable embed title | Keep the embed; improve field grouping, text budgets, and metadata |
| Telegram | `sendPhoto` with formatted caption | URL inline-keyboard button | Keep the current structure; make caption truncation entity-safe |
| QQ | Custom Markdown for group/user; capability-aware fallback for channels | Markdown link | Do not depend on keyboards; fix image dimensions and split behavior by target type |
| Feishu/Lark | Card schema 2.0 | `open_url` button behavior | Migrate from the legacy card shape; keep remote screenshot as a link unless app credentials are added |
| DingTalk | `actionCard` | `singleURL` or URL-only `btns` | Keep ActionCard for individual notifications; reserve FeedCard for digests |
| WhatsApp | Approved media template | Template URL button | Always use a template; require opt-in and fail closed when the approved contract does not match |
| LINE | One Flex Message bubble | Flex `uri` button | Use a screenshot hero, compact facts, and a callback-free URI action |
| Slack | Incoming Webhook with Block Kit | `mrkdwn` or rich-text link | Use native blocks, but avoid button elements because even URL buttons require acknowledgements |

Across adapters, preserve the common `Notification` model but add adapter-owned layout and length budgets. A single universal text renderer would discard the strongest native features of each platform.

## WeCom Group Robots

### Official capabilities

- A WeCom group robot receives messages through its group-scoped webhook. The webhook key grants send access and must be stored as a Secret. [Group robot webhook](https://developer.work.weixin.qq.com/document/path/91770)
- Template Cards provide a platform-native presentation with source identity, main title, image, vertical and horizontal content, and a card action. The `news_notice` card used here is a natural fit for one screenshot-led update. [Template Card messages](https://developer.work.weixin.qq.com/document/path/91770#template_card-%E7%B1%BB%E5%9E%8B)
- A card action with `type: 1` opens an ordinary URL and does not require a callback service. This keeps scheduled delivery one-way and stateless.

### Adapter recommendation

Keep one `news_notice` Template Card per notification:

- Use the project-owned content-addressed icon as the source identity; operators should not need to provision separate branding URLs.
- Keep the optimized screenshot as `card_image` and the same public URL as the whole-card action.
- Use `vertical_content_list` for substantial sections and `horizontal_content_list` for compact facts, preserving the most important items when platform budgets require truncation.
- Keep routing in the Secret's optional `notifications` array so schedules, Salmon Run, and gear can target different group robots without legacy one-variable-per-webhook configuration.
- Treat any non-zero `errcode` as a platform rejection even when the HTTP request succeeds.

Safe payload shape:

```js
{
  msgtype: "template_card",
  template_card: {
    card_type: "news_notice",
    source: { icon_url: iconUrl, desc: sourceName, desc_color: 0 },
    main_title: { title, desc: subtitle },
    card_image: { url: screenshotUrl, aspect_ratio: 1.78 },
    vertical_content_list: sections,
    horizontal_content_list: facts,
    card_action: { type: 1, url: screenshotUrl }
  }
}
```

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

## WhatsApp Cloud API

### Official capabilities

- Businesses must obtain opt-in before messaging a person on WhatsApp. The recipient must have provided their mobile number and consented to subsequent messages or calls from the named business. [Get opt-in for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)
- A customer service window starts when the user messages or calls the business and lasts 24 hours, resetting on another user message or call. Free-form service messages are only available inside that window; outside it, only pre-approved template messages can be sent. [Service messages and customer service windows](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows) [Template fundamentals](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- Cloud API sends through `POST /{Version}/{Phone-Number-ID}/messages` with an `Authorization: Bearer ...` header. A successful response accepts the request and returns a WhatsApp message ID; delivery status and some asynchronous errors are exposed through optional `messages` webhooks. The adapter pins the current Graph API `v25.0` in source. [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/) [Messages API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) [Error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes)
- Templates can contain header, body, footer, and button components. A media header can use a public image URL at send time, although Meta recommends uploaded media IDs for higher reliability and throughput. URL buttons open the device browser, support one variable appended to the URL, and do not require an interaction callback. [Template media](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-media) [Template components: URL buttons](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components#url-buttons)
- Relevant hard limits include a 1,024-character template body, a 60-character footer, at most two URL buttons, and 5 MB for JPEG or PNG images. Template status must be `APPROVED` before sending. [Template components](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components) [Supported media types](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media#supported-media-types)
- Each registered business phone number supports up to 80 messages per second by default and may be upgraded automatically to 1,000. Separate account-specific messaging limits cap template delivery outside service windows; operators must read the effective tier from WhatsApp Manager rather than hard-code a recipient limit. [Throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput) [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)

### Adapter recommendation

Use an approved media template for every scheduled notification, even if a customer service window happens to be open. This avoids storing user-session state and guarantees that a delayed workflow does not accidentally cross the 24-hour boundary.

- Treat opt-in as an operator prerequisite that cannot be inferred from a Secret. Document it and never send to scraped or unconsented phone numbers.
- Use one project-owned template contract with an image header, concise fixed copy surrounding named body parameters, and one URL button. The screenshot is the visual hero; the body should carry `title`, `context`, and a bounded `details` summary.
- Create the template under the category that accurately matches the use case. Recurring game-content notifications may be treated as marketing by Meta; do not mislabel them as utility to bypass review or pricing.
- Keep visual formatting in the approved template and pass plain parameter values. Text headers do not support Markdown special characters; URL-button parameters containing special characters must be percent-encoded before sending.
- Configure the approved URL button from the exact published asset namespace (`S3_CONFIG.publicBaseUrl` plus `keyPrefix`) as `<asset base URL>/{{action_path}}`. Before sending, require `notification.action.url` to share that exact prefix, strip the prefix, percent-encode each path segment while preserving separators, and pass it as the button parameter. Fail locally rather than sending a malformed or unapproved URL shape.
- Use the public screenshot URL in the image-header parameter for the first implementation. Enforce HTTPS, matching JPEG/PNG MIME and bytes, and the 5 MB limit. A later upload-and-cache path can reuse the same access token and media IDs, but it should be an explicit reliability optimization rather than hidden target state.
- A `200` response proves API acceptance, not recipient delivery. A webhook service is optional for sending and for the URL button, but is required if the project later promises delivery receipts or asynchronous-failure reporting.
- Handle errors by Meta error `code` and `details`, not only HTTP status. Retry transient or throughput errors with bounded backoff; do not retry opt-out, policy, invalid-template, or invalid-recipient failures.

Recommended `BOT_WHATSAPP_CONFIG` Secret schema:

```yaml
- name: personal-updates
  notifications: [schedules, salmon-run, gear-dailydrop, gear-regular]
  accessToken: EAA...
  phoneNumberId: "123456789012345"
  recipientPhoneNumber: "8613800000000"
  templateName: splatoon_notification
  languageCode: zh_CN
```

Keep the Graph API version pinned in source code rather than the Secret so upgrades are reviewed and payload-golden tests remain deterministic. `WABA_ID` is needed to create or manage templates, but not for this runtime send-target contract.

The referenced `splatoon_notification` template has this exact project contract:

- `category`: submit as `MARKETING` unless Meta explicitly approves a different accurate category.
- `parameter_format`: `named`.
- `HEADER`: `IMAGE`; the send-time `image.link` is `notification.image.url`.
- `BODY`: `Splatoon 3 通知已更新\n\n{{title}}\n{{context}}\n{{details}}\n\n点击下方按钮查看完整截图。`
- `FOOTER`: `今天你喷喷了吗？`
- First and only button: `URL`, label `查看截图`, URL `<exact published asset base URL>/{{action_path}}`. Replace the placeholder origin with the real public namespace before template submission.

The adapter must project parameters as follows and must truncate by Unicode code point without cutting formatting tokens:

| Parameter | Source | Local budget |
| --- | --- | --- |
| `title` | `notification.title` | 120 characters |
| `context` | `notification.subtitle ?? notification.source.name` | 160 characters |
| `details` | Sections first, then facts, using one compact line per item | 560 characters |
| `action_path` | Percent-encoded suffix after the exact published asset base URL prefix | Resulting approved URL at most 2,000 characters |

The fixed copy plus these budgets stays below the 1,024-character body limit. A missing value becomes `-`; the adapter must never omit a named parameter because error `132000` is returned when the send payload does not match the approved template variables.

Safe template-send direction:

```js
{
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: recipientPhoneNumber,
  type: "template",
  template: {
    name: templateName,
    language: { code: languageCode },
    components: [
      { type: "header", parameters: [{ type: "image", image: { link: screenshotUrl } }] },
      {
        type: "body",
        parameters: [
          { type: "text", parameter_name: "title", text: boundedTitle },
          { type: "text", parameter_name: "context", text: boundedContext },
          { type: "text", parameter_name: "details", text: boundedDetails }
        ]
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{
          type: "text",
          parameter_name: "action_path",
          text: encodedActionPath
        }]
      }
    ]
  }
}
```

## LINE Messaging API

### Official capabilities

- Push messages can be sent at any time to users who added the LINE Official Account as a friend, chats the account has joined, or a non-friend user who messaged the account within the previous seven days. LINE can still return `200` when a deleted, blocked, or otherwise ineligible user does not receive the message. [Send push message](https://developers.line.biz/en/reference/messaging-api/#send-push-message)
- The push endpoint is `POST https://api.line.me/v2/bot/message/push`, authenticated by a channel access token in the Bearer header. It accepts a user, group, or room ID as `to`, up to five message objects per request, and an optional `X-Line-Retry-Key` for idempotent retries. [Send push message](https://developers.line.biz/en/reference/messaging-api/#send-push-message)
- Flex Messages provide native bubble and carousel layouts with header, hero, body, and footer blocks. Required `altText` is limited to 1,500 characters, a bubble definition to 30 KB, and a carousel to 50 KB and 12 bubbles. Rendering can vary by client OS, version, resolution, language, and font. [Flex Message](https://developers.line.biz/en/reference/messaging-api/#flex-message) [Send Flex Messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- A Flex image can load a public HTTPS JPEG or PNG URL, with a maximum URL length of 2,000 characters, image dimensions of 1,024 by 1,024, and file size of 10 MB; LINE recommends 1 MB or less. [Flex image component](https://developers.line.biz/en/reference/messaging-api/#f-image)
- A Flex button can use a `uri` action. Tapping it opens the URI in LINE's in-app browser; unlike a postback action, it does not require a webhook callback. URI actions support `http`, `https`, `line`, and `tel` schemes and a 1,000-character URI. [URI action](https://developers.line.biz/en/reference/messaging-api/#uri-action)
- Push messages are limited to 2,000 requests per second per channel and are also subject to the account's monthly message quota. Common failures include `400` invalid targets or message objects, `401` invalid access token, `409` duplicate retry key, and `429` rate or monthly-quota exhaustion. [Rate limits and status codes](https://developers.line.biz/en/reference/messaging-api/#rate-limits) [Send push message errors](https://developers.line.biz/en/reference/messaging-api/#send-push-message-error-response)

### Adapter recommendation

Use one Flex bubble per notification and make it look intentionally native:

- Use a compact accent-colored header with the source and title, a full-width `16:9` hero image in `fit` mode so screenshots are never cropped, a body for subtitle and sections, two-column rows for short facts, and one primary footer button.
- Apply the same `uri` action to the hero image and footer button. Both are ordinary navigation and need no callback server.
- Generate `altText` from the title and most important context so notifications and clients without Flex rendering remain useful.
- Keep the bubble below 30 KB and the whole HTTP body below LINE's 2 MB common request limit. The provider-neutral S3 publisher creates the real `1024×576` notification PNG before upload rather than projecting a CDN transformation URL. Before sending, inspect the public object and reject a missing or mismatched image MIME type, unsupported bytes, dimensions above `1024×1024`, or a file above 10 MB.
- Generate one UUID retry key per target and notification delivery, and reuse it only for retries of that same logical delivery. Preserve `X-Line-Request-Id` in errors for diagnosis.
- Treat a `409` response carrying `X-Line-Accepted-Request-Id` as an already accepted duplicate of the same retry key, not as a second failed delivery.
- Treat `200` as API acceptance rather than proof of display because blocked or deleted recipients can be silently skipped.

Recommended `BOT_LINE_CONFIG` Secret schema:

```yaml
- name: personal-chat
  notifications: [schedules, salmon-run, gear-dailydrop, gear-regular]
  channelAccessToken: "..."
  targetType: user
  targetId: U0123456789abcdef0123456789abcdef
```

`targetType` should be one of `user`, `group`, or `room`. The API only sends `targetId` as `to`, but the explicit type gives strict configuration validation and clearer error messages.

Safe payload direction:

```js
{
  to: targetId,
  messages: [{
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      header: accentHeader,
      hero: {
        type: "image",
        url: screenshotUrl,
        size: "full",
        aspectRatio: "16:9",
        aspectMode: "fit",
        action: { type: "uri", uri: actionUrl }
      },
      body: boundedBody,
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "button",
          style: "primary",
          color: accentHex,
          action: { type: "uri", label: actionLabel, uri: actionUrl }
        }]
      }
    }
  }]
}
```

## Slack Incoming Webhooks and Block Kit

### Official capabilities

- An Incoming Webhook is a secret URL bound to one Slack app installation and channel. Posting JSON can use Slack text formatting and Block Kit; the webhook cannot override its configured channel, username, or icon and cannot delete a posted message. [Sending messages using incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/)
- Block Kit supports up to 50 blocks per message. Useful native pieces here include a 150-character header, section text up to 3,000 characters, up to ten two-column fields of 2,000 characters each, and a public image block with a 3,000-character URL and 2,000-character alt text. [Blocks](https://docs.slack.dev/reference/block-kit/blocks/) [Header block](https://docs.slack.dev/reference/block-kit/blocks/header-block/) [Section block](https://docs.slack.dev/reference/block-kit/blocks/section-block/) [Image block](https://docs.slack.dev/reference/block-kit/blocks/image-block/)
- A Block Kit button with a `url` still emits an interaction payload and requires an acknowledgement response. It is therefore not safe for a webhook-only adapter with no callback endpoint. Ordinary `mrkdwn` links and rich-text link elements provide callback-free navigation. [Button element](https://docs.slack.dev/reference/block-kit/block-elements/button-element/) [Formatting links](https://docs.slack.dev/messaging/formatting-message-text/#linking-urls)
- Slack `mrkdwn` requires `&`, `<`, and `>` to be escaped when they are literal text. Link syntax deliberately uses `<url|label>`, so escape user-visible fragments before constructing the final link token. [Escaping text](https://docs.slack.dev/messaging/formatting-message-text/#escaping-text)
- Incoming Webhooks are limited to one message per second, with short bursts allowed. A `429` response includes `Retry-After`; successful delivery normally returns HTTP `200` and plain text `ok`. Other failures use HTTP status plus a plain-text token such as `invalid_payload`, `action_prohibited`, or `channel_is_archived`. [Rate limits](https://docs.slack.dev/apis/web-api/rate-limits/) [Incoming Webhook errors](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/#handling_errors)

### Adapter recommendation

Use Block Kit without interactive components:

- Include top-level `text` as an accessible fallback and notification preview.
- Use a header block for the title, a context block for source and subtitle, a full-width image block for the screenshot, section blocks for narrative content, and section `fields` for two-column facts.
- End with a divider and a prominent bold `mrkdwn` link such as `*<url|View screenshot →>*`. Do not imitate a button with unsupported markup and do not add a real button until an interactivity Request URL and acknowledgement service exist.
- Set `verbatim: true` on `mrkdwn` text objects and construct links explicitly after escaping literal `&`, `<`, and `>`. This prevents notification data from accidentally becoming a channel, user, or special mention.
- Keep the default app name and icon controlled by the Slack app configuration; do not expose ineffective per-target overrides. Accept only official Slack or Slack Gov HTTPS Incoming Webhook URLs.
- Enforce aggregate block count, escaped-output field budgets, and action-link URL budgets before serialization without truncating inside `&amp;`, `&lt;`, or `&gt;` entities. Retry only `429` and transient server errors, respecting `Retry-After`; do not retry structural or channel-state errors without a configuration change.
- Treat the documented plain-text `ok` response as the success contract even when an intermediary returns HTTP `200`; reject any other response body.

Recommended `BOT_SLACK_CONFIG` Secret schema:

```yaml
- name: team-channel
  notifications: [schedules, salmon-run, gear-dailydrop, gear-regular]
  webhookUrl: https://hooks.slack.com/services/T.../B.../...
```

Safe payload direction:

```js
{
  text: fallbackText,
  unfurl_links: false,
  unfurl_media: false,
  blocks: [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    { type: "context", elements: contextElements },
    { type: "image", image_url: screenshotUrl, alt_text: imageAlt },
    ...sectionBlocks,
    ...factFieldBlocks,
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: actionLink, verbatim: true } }
  ]
}
```

## Implementation Status

All nine platforms are implemented as ordinary adapters in the existing concurrent partial-success delivery process. Their Secrets are optional and auto-enable each Channel; GitHub Actions keeps one shared publish-and-notify Job rather than creating one Job per platform. Contract and payload-golden tests cover native layout, escaping, platform budgets, retry behavior, target validation, and callback-free actions.

WhatsApp remains operationally disabled until its Secret exists, but configuration alone is not sufficient: the operator must also complete opt-in, billing, phone-number registration, and exact media-template approval. LINE should likewise be enabled only after a smoke run confirms the real CDN derivative and destination eligibility.

## Official-Documentation Access Notes

- WeCom's official group-robot documentation was used for the Template Card and whole-card URL-action contract.
- Discord and Telegram documentation was directly accessible from their official developer sites.
- QQ official pages were directly accessible. The 2026-04-23 custom-Markdown update is current relative to this research date, but QQ's overview and generated endpoint tables are not perfectly consistent about universal ARK support; the recommendation intentionally avoids relying on that uncertainty.
- Feishu's official custom-bot guide was directly accessible in its first-party Markdown representation.
- DingTalk's official documentation is dynamically rendered. The message-type names, webhook model, and rate limit were verified from official rendered pages, but exact field-length limits were not reliably extractable; this note intentionally omits them rather than citing unofficial values.
- Meta's current first-party WhatsApp Business Platform pages were directly accessible in their official Markdown and rendered forms. Template categorization remains subject to Meta review, so this note does not promise that a recurring Splatoon notification will be accepted as `UTILITY`.
- LINE's official Messaging API reference and source Markdown were directly accessible. The recommendation intentionally treats push `200` responses as acceptance only because LINE documents silent non-delivery cases.
- Slack's official developer documentation was directly accessible. The callback requirement for URL buttons is explicit; the webhook-only recommendation therefore uses a normal link instead of an interactive button.
