# splatoon3-bot

Splatoon 3 automation that turns one validated Data Snapshot into deterministic Screenshot Artifacts, publishes the selected PNG files to Upyun, and delivers platform-specific rich notifications.

The project currently provides adapters for WeCom, Discord, Telegram, QQ, Feishu, DingTalk, WhatsApp, LINE, and Slack. Domain terminology is defined in [CONTEXT.md](./CONTEXT.md).
The platform capability audit and native presentation decisions are documented in [docs/notification-platform-capabilities.md](./docs/notification-platform-capabilities.md).

## Requirements

- Node.js 24 LTS
- pnpm 11.18 or newer within major version 11

Chrome does not need to be installed manually. The screenshot runtime downloads and caches the Chrome for Testing revision pinned by `puppeteer-core`. Set `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_CHANNEL`, or `PUPPETEER_BROWSER_VERSION` only when an explicit override is required.

On Linux CI, the runtime adds Chrome's `--no-sandbox` and `--disable-setuid-sandbox` flags because current GitHub-hosted Ubuntu runners restrict the user-namespace sandbox. These flags are not added to local development launches.

## Development

```sh
corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run download-data
pnpm run verify
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Start the Vite development server. |
| `pnpm run download-data` | Download and atomically publish one validated Data Snapshot. |
| `pnpm run bot:describe <profile>` | Resolve a Run Profile and its Screenshot and Notification selections. |
| `pnpm run bot:prepare <profile>` | Download data, build, render screenshots, and write the Run Manifest. |
| `pnpm run bot:publish <profile>` | Verify the Run Manifest and PNG hashes, then publish only selected screenshots. |
| `pnpm run bot:notify <profile> [channel]` | Deliver every configured Channel, or one explicitly selected Channel. |
| `pnpm run test:unit` | Run Run Plan, Data Snapshot, adapter, delivery, Manifest, and publisher tests. |
| `pnpm run test:browser-ci` | Force Linux CI launch arguments and verify that Chrome starts successfully. |
| `pnpm run test:visual` | Compare deterministic local screenshots with committed golden PNGs. |
| `pnpm run verify` | Run actionlint, syntax checks, all tests, production build, and the full dependency audit. |
| `pnpm run verify:actions` | Execute the GitHub `Verify` job locally in an OrbStack `linux/amd64` runner through `act`. |

## Run Profiles

YAML selects only a Run Profile. Screenshot names, routes, dimensions, output filenames, and notification ordering are owned by `bot/run/RunPlan.mjs`; the Channel adapter registry owns platform names and their explicit GitHub Secret mappings.

| Run Profile | Screenshot Artifacts | Notifications |
| --- | --- | --- |
| `schedules` | `schedules.png` | `schedules` |
| `salmon-run` | `salmon-run.png` | `salmon-run` |
| `gear` | `gear-dailydrop.png`, `gear-regular.png` | `gear-dailydrop`, then `gear-regular` |
| `salmon-run-and-gear` | `salmon-run.png`, `gear-dailydrop.png`, `gear-regular.png` | Salmon Run, then both gear notifications |

Production Screenshot Definitions use a `1200×675` viewport at `2x` device scale, producing `2400×1350` PNG files.

## GitHub Actions

Scheduled and manual entry workflows call `.github/workflows/bot-reusable.yml`. A Bot Run has two ordered stages:

1. `prepare` downloads one complete Data Snapshot, builds the screenshot frontend, validates render structure, creates the selected Screenshot Artifacts, and archives the Bot Run for seven days.
2. `publish` downloads the archive once, validates and syncs the selected PNG files to Upyun, then automatically discovers configured `BOT_*_CONFIG` Secrets and runs those Channel adapters in parallel from the same Node.js process.

Official GitHub Actions are pinned to immutable commit SHAs. CI runs `pnpm run verify` for pushes to `main`, pull requests, and manual verification runs.

For a full local runner check on macOS, install and start OrbStack, install `act`, then run `pnpm run verify:actions`. The command builds the pinned `.github/act/Dockerfile` runner with Chrome's Linux runtime libraries, executes the workflow as `linux/amd64`, and reuses the local image on later runs.

The `publish` job uses the `production` GitHub Environment. Configure its deployment-branch policy and optional required reviewers to prevent untrusted refs from using production credentials.

The scheduled entry points are:

- `bot-schedules.yml`: `schedules` every two hours.
- `bot-salmon-run.yml`: `salmon-run-and-gear` at `02:00` and `10:00` UTC.
- `bot-manual.yml`: manually selects any Run Profile and notifies every configured Channel.
- `notification-smoke.yml`: manually runs the complete prepare, publish, and notify flow for one Channel; it is not side-effect free.

## Repository Configuration

Configure these under **Settings → Secrets and variables → Actions**.

### Secrets

| Repository Secret | Description |
| --- | --- |
| `UPYUN_BUCKET` | Upyun service name. |
| `UPYUN_OPERATOR` | Upyun operator. |
| `UPYUN_SECRET` | Upyun operator password. |
| `UPYUN_DOMAIN` | Absolute public HTTP(S) asset origin used in notification images and links, for example `https://splatoon.example.com`. |
| `BOT_WECOM_CONFIG` | WeCom Target array. |
| `BOT_DISCORD_CONFIG` | Discord Target array. |
| `BOT_TELEGRAM_CONFIG` | Telegram Target array. |
| `BOT_QQ_CONFIG` | QQ Target array. |
| `BOT_FEISHU_CONFIG` | Feishu Target array. |
| `BOT_DINGTALK_CONFIG` | DingTalk Target array. |
| `BOT_WHATSAPP_CONFIG` | WhatsApp Cloud API Target array. |
| `BOT_LINE_CONFIG` | LINE Messaging API Target array. |
| `BOT_SLACK_CONFIG` | Slack Incoming Webhook Target array. |

Each configured `BOT_*_CONFIG` Secret automatically enables its Channel adapter. An absent or empty Secret disables that adapter, so `BOT_NOTIFICATION_CHANNELS` and `BOT_CHANNEL_CONFIG` are not used. `UPYUN_DOMAIN` is required when at least one notification Channel is configured.

## Notification Targets

Every Channel Secret must contain a direct, non-empty JSON array of Target objects. Target `name` values must be unique within one Channel. Schemas are strict, so unknown fields fail configuration validation instead of being silently ignored.

Configured Channels and multiple Targets within each Channel run in parallel. Notifications for the same Target run in Run Profile order. GitHub Actions publishes assets and delivers every configured Channel in one Job, so dependencies and the archived Bot Run are loaded only once.

The optional `notifications` array routes only the selected Notification IDs to a Target. Omit it to send every Notification in the active Run Profile. Valid IDs are `schedules`, `salmon-run`, `gear-dailydrop`, and `gear-regular`; a Bot Run fails when none of its Notifications match any configured Target.

### WeCom

```json
[
  {
    "name": "battle-schedules",
    "notifications": ["schedules"],
    "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
  },
  {
    "name": "salmon-run",
    "notifications": ["salmon-run"],
    "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
  },
  {
    "name": "gear",
    "notifications": ["gear-dailydrop", "gear-regular"],
    "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
  }
]
```

### Discord

`username` and `avatarUrl` are optional webhook presentation overrides. The notification uses one image-rich Embed; its title is the primary clickable action, avoiding a dependency on webhook component permissions.

```json
[
  {
    "name": "community",
    "webhookUrl": "https://discord.com/api/webhooks/.../...",
    "username": "Splatoon Bot",
    "avatarUrl": "https://splatoon.example.com/icon.png"
  }
]
```

### Telegram

`chatId` accepts a string or integer. `messageThreadId` and `disableNotification` are optional. The adapter uses a photo-first layout, entity-safe HTML budgeting, and one URL-only inline button.

```json
[
  {
    "name": "group-topic",
    "botToken": "123456:ABC...",
    "chatId": "-1001234567890",
    "messageThreadId": 42,
    "disableNotification": false
  }
]
```

### QQ

The adapter uses the official QQ Bot access-token flow. `targetType` is `channel`, `group`, or `user`. Group and user targets use custom Markdown. Channel targets default to the broadly available Embed format; set `messageFormat` to `markdown` only when that bot has QQ's channel custom-Markdown capability. `apiBaseUrl` and `tokenUrl` are optional test or proxy overrides.

```json
[
  {
    "name": "official-group",
    "appId": "102...",
    "clientSecret": "...",
    "targetType": "group",
    "targetId": "GROUP_OPENID"
  },
  {
    "name": "official-channel-with-markdown-access",
    "appId": "102...",
    "clientSecret": "...",
    "targetType": "channel",
    "targetId": "CHANNEL_ID",
    "messageFormat": "markdown"
  }
]
```

### Feishu

`secret` is optional and enables signed custom-bot requests. The webhook-only adapter uses Card Schema 2.0 and an `open_url` button. Public screenshot URLs remain links because inline card images require an app-authenticated `image_key`.

```json
[
  {
    "name": "team",
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/...",
    "secret": "..."
  }
]
```

### DingTalk

`secret` is optional and enables signed custom-robot requests. Each notification uses an ActionCard with the screenshot in Markdown and a URL-only primary action.

```json
[
  {
    "name": "team",
    "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=...",
    "secret": "SEC..."
  }
]
```

### WhatsApp

The adapter uses Meta's Graph API `v25.0` and always sends an approved media template, so delayed scheduled runs never depend on a 24-hour customer-service window. Before configuring a Target, register a WhatsApp Business phone number, obtain explicit recipient opt-in, configure billing, and obtain approval for the exact template contract below. A synchronous success means Meta accepted the message; delivery receipts require a separate webhook receiver.

Create a named-parameter template named `splatoon_notification`:

- Submit the accurate category; recurring game updates should default to `MARKETING` unless Meta approves another category.
- Add an `IMAGE` header.
- Use body text `Splatoon 3 通知已更新\n\n{{title}}\n{{context}}\n{{details}}\n\n点击下方按钮查看完整截图。`.
- Add footer text `今天你喷喷了吗？`.
- Add one URL button named `查看截图` with URL `<exact UPYUN_DOMAIN>/{{action_path}}`.

The adapter supplies the screenshot header plus the four named parameters, validates the approved URL prefix locally, inspects the real public image before sending, and rejects missing or mismatched image MIME types, unsupported media bytes, images above 5 MB, or malformed API acceptance responses. Meta throughput codes receive bounded retries; policy, template, and recipient errors fail with their official code and details.

```json
[
  {
    "name": "personal-updates",
    "notifications": ["schedules", "salmon-run", "gear-dailydrop", "gear-regular"],
    "accessToken": "EAA...",
    "phoneNumberId": "123456789012345",
    "recipientPhoneNumber": "8613800000000",
    "templateName": "splatoon_notification",
    "languageCode": "zh_CN"
  }
]
```

### LINE

The adapter sends one native Flex Message bubble with an accent header, uncropped `16:9` screenshot hero, compact sections and facts, and a URL-only primary action. `targetType` is `user`, `group`, or `room`; the matching `targetId` must begin with `U`, `C`, or `R`. The recipient must be eligible for push delivery under LINE's Official Account rules.

The LINE adapter projects each platform-neutral screenshot URL to the Upyun `!sm/fw/1024` derivative. Keep the `sm` image-processing version enabled; before sending, the adapter downloads the real derivative and rejects missing or mismatched image MIME types, unsupported media bytes, dimensions above `1024×1024`, or files above 10 MB. Use `notification-smoke.yml` to verify destination eligibility before enabling scheduled delivery.

```json
[
  {
    "name": "personal-chat",
    "channelAccessToken": "...",
    "targetType": "user",
    "targetId": "U0123456789abcdef0123456789abcdef",
    "notificationDisabled": false
  }
]
```

### Slack

Create a Slack app, enable Incoming Webhooks, add an official `https://hooks.slack.com/services/...` or Slack Gov webhook to the destination channel, and store it in `BOT_SLACK_CONFIG`. The adapter uses Block Kit with accessible fallback text, a header, source context, screenshot, two-column facts, and a callback-free `mrkdwn` action link. It intentionally avoids Block Kit buttons because even URL buttons require an interaction acknowledgement endpoint, and it accepts delivery only when Slack returns the documented `ok` success token.

```json
[
  {
    "name": "team-channel",
    "webhookUrl": "https://hooks.slack.com/services/T.../B.../..."
  }
]
```

## Failure Semantics

- The six Data Snapshot resources download concurrently with retries and timeouts, validate before publication, and replace the previous snapshot atomically. Invalid or partial data never replaces a valid snapshot.
- Archived Data Snapshots verify their recorded byte counts and SHA-256 digests when loaded for notification delivery.
- Screenshot capture waits for the application readiness seam, loaded fonts and images, exact viewport geometry, footer position, and zero overflow before writing an artifact atomically.
- Publication verifies the Run Profile, ordered artifact set, stable filenames, byte counts, and SHA-256 digests. `run-manifest.json` and unrelated files are never uploaded to Upyun.
- Configured Channel adapters run concurrently inside one process, so one platform failure does not cancel another platform that is already running.
- Targets inside a Channel also run in parallel. Successful deliveries remain successful when another Channel or Target fails; all results are retained and failures are raised together as an `AggregateError`.
- The notification step writes a per-Channel summary and fails the `publish` job only after every configured Channel has completed.

## Screenshot Fixtures

Visual tests use committed fixture JSON, local fixture images, a fixed render time, and committed golden PNGs. Successful external fixture image requests are forbidden, so the test does not depend on the live `splatoon3.ink` image CDN.

Golden files use `1x` device scale to keep repository size manageable; structural assertions independently enforce the production `2x` Screenshot Definitions. Pixel differences above `0.1%` fail the test and write diff images under `.cache/visual-diff/`.

Golden screenshots are platform-specific because Chrome uses different font rasterizers on macOS and Linux. Local Apple Silicon runs compare against `tests/golden/screenshots/darwin-arm64`, while GitHub Actions and the OrbStack `act` runner compare against `tests/golden/screenshots/linux-x64`. Both sets must contain every Screenshot Definition.

The local `act` runner image derives its pnpm, Chrome for Testing, and browser-installer versions from the checked-out project. Baking those tools into the image avoids repeated network-dependent bootstrap work inside each OrbStack workflow container; GitHub-hosted runners continue to use the official setup Actions and caches.

After intentionally refreshing fixture JSON from live data, update assets and baselines in this order:

```sh
pnpm run test:localize-fixture
pnpm run test:update-notification-golden
pnpm run test:update-golden
pnpm run test:visual
pnpm run verify
```

Review every changed image before accepting new golden PNGs.

## Legacy Configuration

The old single-WeCom Secrets are intentionally unsupported:

- `SPLATOON_SCHEDULES_BOT_URL`
- `SPLATOON_SALMON_RUN_BOT_URL`
- `SPLATOON_GEAR_BOT_URL`

Replace them with `BOT_WECOM_CONFIG`, using the direct Target array format above. No compatibility fallback is provided.
