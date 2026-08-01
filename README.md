<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="./src/assets/img/favicon.svg" width="96" height="96" alt="splatoon3-bot logo">
</p>

<h1 align="center">splatoon3-bot</h1>

<p align="center">
  Deterministic Splatoon 3 screenshots and native rich notifications.<br>
  One validated Data Snapshot, one trustworthy Bot Run, every configured community.
</p>

<p align="center">
  <a href="https://github.com/TenviLi/splatoon3-bot/actions/workflows/ci.yml"><img alt="Verify workflow" src="https://github.com/TenviLi/splatoon3-bot/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="GitHub Actions hosted" src="https://img.shields.io/badge/operations-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white">
  <img alt="Nine notification adapters" src="https://img.shields.io/badge/notification%20adapters-9-6F42C1">
  <img alt="S3 compatible" src="https://img.shields.io/badge/storage-S3%20compatible-569A31?logo=amazons3&logoColor=white">
  <a href="./LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/TenviLi/splatoon3-bot?label=license"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#preview">Screenshots</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#notification-channels">Channels</a> ·
  <a href="#reliability">Reliability</a>
</p>

## Overview

`splatoon3-bot` turns one validated [Splatoon 3](https://splatoon3.ink/) Data Snapshot into reproducible Screenshot Artifacts, publishes optimized and original PNG files through the S3 protocol, and delivers carefully designed notifications through every configured platform adapter.

<table>
  <tr>
    <td width="33%" align="center"><strong>Deterministic rendering</strong><br><sub>Fixed data, viewport, timing, fonts, image readiness, geometry, and platform-specific visual goldens.</sub></td>
    <td width="33%" align="center"><strong>Portable publication</strong><br><sub>AWS S3, Cloudflare R2, MinIO, Upyun S3, and other SigV4-compatible object stores.</sub></td>
    <td width="33%" align="center"><strong>Native presentation</strong><br><sub>Rich cards, embeds, templates, Flex Messages, and Block Kit instead of lowest-common-denominator text.</sub></td>
  </tr>
  <tr>
    <td width="33%" align="center"><strong>Parallel delivery</strong><br><sub>Channels and Targets run concurrently while preserving Notification order for each destination.</sub></td>
    <td width="33%" align="center"><strong>Manifest integrity</strong><br><sub>Dimensions, hashes, URLs, render options, and data identity remain bound across every stage.</sub></td>
    <td width="33%" align="center"><strong>CI-first operations</strong><br><sub>Immutable Actions, protected Environments, strict YAML, local Linux verification, audits, and contract tests.</sub></td>
  </tr>
</table>

Nine adapters are included today: **WeCom, Discord, Telegram, QQ, Feishu, DingTalk, WhatsApp, LINE, and Slack**. Domain terminology lives in [CONTEXT.md](./CONTEXT.md), while the detailed native-platform design audit lives in [docs/notification-platform-capabilities.md](./docs/notification-platform-capabilities.md).

## Preview

### View all four deterministic Screenshot Artifacts

<table>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/schedules.png" alt="Schedules screenshot"><br><sub><code>schedules.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/salmon-run.png" alt="Salmon Run screenshot"><br><sub><code>salmon-run.png</code></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-dailydrop.png" alt="SplatNet Gear daily drop screenshot"><br><sub><code>gear-dailydrop.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-regular.png" alt="SplatNet Gear regular screenshot"><br><sub><code>gear-regular.png</code></sub></td>
  </tr>
</table>

Production Screenshot Definitions use a `1200×675` viewport at `2x` device scale, producing exact `2400×1350` PNG files. The publisher additionally creates `1024×576` notification variants for cross-platform delivery.

## Quick Start

### Run in Your Own Private Repository

Each installation belongs in a Private repository under the operator's own GitHub account. That repository is the deployment and trust boundary: its owner can customize the code and independently manage every Repository Secret, Repository Variable, Environment, schedule, and protection rule.

<p align="center">
  <a href="https://github.com/TenviLi/splatoon3-bot/fork"><strong>Fork your private installation →</strong></a>
</p>

> [!TIP]
> Hosted operation needs only GitHub Actions, one S3-compatible bucket, and at least one messaging destination. **You do not need to install Node.js, pnpm, Chrome, Docker, or a server.**

| You provide | Stored as | Start here |
| --- | --- | --- |
| Three public notification icon URLs | Repository Variable `BOT_BRANDING_CONFIG` | [Branding example](#1-repository-variables) |
| S3-compatible upload credentials and public asset URL | Repository Secret `S3_CONFIG` | [Storage setup](#2-publication-secret) |
| One or more messaging destinations | Repository Secret `BOT_*_CONFIG` | [Choose a Channel](#notification-channels) |

1. Use **Fork** to create the installation under your own GitHub account while this source repository remains Private and its forking policy permits it. If Fork is unavailable, or if the source later becomes Public, create an independent Private copy with **Use this template** or [GitHub Importer](https://github.com/new/import)—[public repository forks are always public](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-permissions-and-visibility-of-forks#visibility-of-forks) and cannot be made Private independently.
2. Open the Private repository's <kbd>Actions</kbd> tab, allow workflows to run if GitHub prompts you, and ensure **Splatoon3 Bot (every 2 hours)** and **Splatoon3 Bot (daily twice)** are enabled.
3. Under that repository's <kbd>Settings</kbd> → <kbd>Secrets and variables</kbd> → <kbd>Actions</kbd>, add `BOT_BRANDING_CONFIG` on the **Variables** tab and `S3_CONFIG` on the **Secrets** tab. Both values use the YAML examples below.
4. Choose any platform from [Notification Channels](#notification-channels), follow its official setup guide, and create the corresponding `BOT_*_CONFIG` Repository Secret. Each present Secret enables that adapter automatically.
5. Run **Check Bot Configuration** with the `all` profile. It validates Variables, Secrets, S3 settings, and Notification routing without publishing an image or sending a message.
6. Run **Notification Channel smoke test** for one configured destination. This is the deliberate side-effecting check: it prepares and publishes current screenshots, then sends a real notification before scheduled delivery is trusted.

> [!IMPORTANT]
> Configure production credentials only in the operator's Private repository—never in this source repository, committed files, pull requests, or copied workflow logs. Repository Secrets and Variables are intentionally installation-local; the project does not contain or provide shared production credentials.

> [!CAUTION]
> Workflows on the Private repository's default branch can consume its credentials. Review incoming changes—especially `.github/workflows/`, `bot/`, and `scripts/`—before merging or synchronizing them. If a credential is ever committed, rotate or revoke it immediately; deleting the file or rewriting history is not sufficient on its own.

<details>
<summary><strong>How the GitHub Actions pipeline works</strong></summary>

## Automation

<p align="center">
  <strong>Data Snapshot</strong> → <strong>Build</strong> → <strong>Screenshot Artifacts</strong> → <strong>Configuration Preflight</strong> → <strong>S3 Publication</strong> → <strong>Channel Adapters</strong>
</p>

### Run Profiles

YAML entry workflows select only a Run Profile. Screenshot names, routes, dimensions, output filenames, and notification ordering belong to `bot/run/RunPlan.mjs`; the Channel registry owns platform names and their explicit GitHub Secret mappings.

| Run Profile | Screenshot Artifacts | Notifications |
| --- | --- | --- |
| `schedules` | `schedules.png` | `schedules` |
| `salmon-run` | `salmon-run.png` | `salmon-run` |
| `gear` | `gear-dailydrop.png`, `gear-regular.png` | `gear-dailydrop`, then `gear-regular` |
| `salmon-run-and-gear` | `salmon-run.png`, `gear-dailydrop.png`, `gear-regular.png` | Salmon Run, then both gear notifications |
| `all` | All four Screenshot Artifacts | Schedules, Salmon Run, then both gear notifications |

### GitHub Actions

Scheduled and manual entry workflows call `.github/workflows/bot-reusable.yml`. Each Bot Run has two ordered stages:

1. **Prepare** downloads one complete Data Snapshot, builds the screenshot frontend, validates render structure, creates the selected Screenshot Artifacts, and archives the Bot Run.
2. **Publish** validates every required Variable and Secret before side effects, downloads the archive once, validates each PNG, creates notification variants, publishes both variants through S3, and runs all selected Channel adapters in parallel from the same Node.js process.

Official GitHub Actions are pinned to immutable commit SHAs. The **Verify** workflow scans the complete Git history with a digest-pinned Gitleaks image and runs `pnpm run verify` for pushes to `main`, pull requests, and manual verification runs. The two Jobs execute independently, so Secret scanning does not reinstall the Node.js toolchain. GitHub Actions is the only supported hosted automation surface; the obsolete GitLab pipeline and its legacy configuration contract are intentionally absent.

| Workflow | Trigger | Run Profile |
| --- | --- | --- |
| `bot-schedules.yml` | Remaining even UTC hours | `schedules` |
| `bot-salmon-run.yml` | `02:00` and `10:00` UTC | `all` |
| `bot-manual.yml` | Manual choice | Any profile |
| `notification-smoke.yml` | Manual profile and Channel | Complete side-effecting smoke run |
| `configuration-check.yml` | Manual profile | Configuration Preflight only; no S3 request or message |

Together, the two scheduled workflows complete exactly one schedules delivery every two hours without overlap.

For a full local runner check on macOS, install and start OrbStack, install `act`, then run `pnpm run verify:actions`. The command first scans complete Git history and the current worktree with the same pinned Gitleaks image used by CI, builds the pinned `.github/act/Dockerfile` runner, executes `Verify`, then runs the complete reusable prepare → artifact → S3 publication → WeCom delivery path against committed fixtures and local fake endpoints. It performs no external publication or notification, retries transient local runner failures once, and reuses local images on later runs. Because `act` does not yet implement the current Artifact service protocol, local prepare and publish Jobs exchange the same selected Bot Run files through an isolated temporary bind mount; official GitHub-hosted runs continue to use the SHA-pinned upload/download Artifact Actions. Local containers inherit the host pnpm registry, bounded download concurrency, and any credential-free host proxy settings; loopback proxy addresses are safely projected through `host.docker.internal`. An npmmirror registry also selects its matching Chrome for Testing mirror. Set `ACT_NPM_REGISTRY`, `ACT_CHROME_DOWNLOAD_BASE_URL`, or `ACT_NETWORK_CONCURRENCY` only when an explicit override is needed. Official GitHub-hosted runs continue to use their normal registry configuration.

</details>

## Configuration

Configure these values in your own Private repository under <kbd>Settings</kbd> → <kbd>Secrets and variables</kbd> → <kbd>Actions</kbd>.

<table>
  <tr>
    <td width="33%"><strong>1. Public presentation</strong><br><sub>Create the required <code>BOT_BRANDING_CONFIG</code> Repository Variable. Add optional render and workflow overrides only when their defaults are unsuitable.</sub></td>
    <td width="33%"><strong>2. Image publication</strong><br><sub>Create the required <code>S3_CONFIG</code> Repository Secret with dedicated S3-compatible credentials and a public asset URL.</sub></td>
    <td width="33%"><strong>3. Message delivery</strong><br><sub>Add any <code>BOT_*_CONFIG</code> Repository Secrets you need. Each present Secret enables its adapter automatically.</sub></td>
  </tr>
</table>

> [!IMPORTANT]
> The minimum production setup is one Repository Variable, `BOT_BRANDING_CONFIG`, and one Repository Secret, `S3_CONFIG`. Notification Secrets are optional: without them, publication succeeds and delivery is intentionally skipped. Reusable-workflow callers pass Secrets explicitly, so do not store them only as Environment Secrets, and never put credentials in Repository Variables or committed files.

Before enabling a schedule, export the same names into the local environment and run `pnpm run bot:doctor all`, or open the repository's <kbd>Actions</kbd> tab and launch **Check Bot Configuration** to inspect the values stored by GitHub. The Configuration Preflight validates every YAML document and Notification route without making an S3 request or sending a message. Production Actions runs the same preflight before its first publication side effect and reports every independent configuration error in one pass without printing Secret values.

The `publish` stage uses the `production` GitHub Environment by default. Configure its deployment-branch policy and optional required reviewers to gate the job before it consumes Repository Secrets, or select another Environment through `BOT_ENVIRONMENT`.

### 1. Repository Variables

Repository Variables expose non-sensitive operational choices without duplicating workflow files. Only `BOT_BRANDING_CONFIG` must be created; every other Variable below has a built-in default and may be omitted.

| Repository Variable | Required | Default | Purpose |
| --- | :---: | --- | --- |
| `BOT_BRANDING_CONFIG` | Yes | — | Strict YAML containing the three public HTTPS branding icon URLs. |
| `BOT_TIME_ZONE` | No | `Asia/Shanghai` | IANA time zone shared by screenshot rendering and notification formatting. |
| `BOT_SCREENSHOT_ATTRIBUTION` | No | `splatoon3.ink` | Platform-neutral footer credit shown beside every Screenshot Artifact title; maximum 40 characters. |
| `BOT_RUNNER` | No | `ubuntu-24.04` | Linux runner label used by both Bot Run stages. Custom runners must provide Chrome runtime libraries. |
| `BOT_ENVIRONMENT` | No | `production` | GitHub Environment gating publication and its deployment policy. |
| `BOT_CONCURRENCY_GROUP` | No | `splatoon3-bot-production` | Concurrency group serializing production Bot Runs. |
| `BOT_ARTIFACT_RETENTION_DAYS` | No | `7` | Screenshot archive retention accepted by `actions/upload-artifact`, from 1 through 90 days. |

> [!TIP]
> Leave `BOT_SCREENSHOT_ATTRIBUTION` unset to show `splatoon3.ink`, or set it to a short custom community credit. The value is trimmed, validated, recorded in both Manifests, and rendered as platform-neutral text without a messaging-platform icon.

<details>
<summary><strong>BOT_BRANDING_CONFIG example</strong></summary>

`BOT_BRANDING_CONFIG` is YAML because it is structured. It is a Variable rather than a Secret, so every URL must be permanently public and must not contain credentials or query tokens.

```yaml
icons:
  schedules: https://assets.example.com/icon.png
  salmonRun: https://assets.example.com/icon2.png
  gear: https://assets.example.com/icon3.png
```

The publisher records these exact validated URLs in the credential-free Publication Manifest. Notification composers consume the Manifest rather than guessing icon or screenshot paths, so branding may live outside the S3 screenshot namespace without hidden pre-provisioning requirements.

</details>

### 2. Publication Secret

| Repository Secret | Description |
| --- | --- |
| `S3_CONFIG` | Strict YAML S3 publication configuration, including the public asset URL and required credentials. |

`S3_CONFIG` is the only publication Secret. `endpoint` is the private S3-compatible API address used for uploads; `publicBaseUrl` is the public HTTPS bucket-root URL consumed by messaging platforms. The publisher appends normalized `keyPrefix` values to both object keys and public URLs, so do not repeat that prefix in `publicBaseUrl`. Empty path segments such as `bot//production` are rejected before upload.

| Provider | Recommended values | Official setup |
| --- | --- | --- |
| AWS S3 | Omit `endpoint`; use the real region and dedicated IAM access keys | [Create a bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html#creating-bucket) · [Manage access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) |
| Cloudflare R2 | `region: auto`; account endpoint; bucket-scoped API token; custom-domain public URL | [Get started](https://developers.cloudflare.com/r2/get-started/) · [Create API tokens](https://developers.cloudflare.com/r2/api/tokens/) · [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) |
| MinIO / AIStor | S3 API endpoint; `forcePathStyle: true`; dedicated access key; public HTTPS read path | [Create a bucket](https://docs.min.io/aistor/reference/cli/mc-mb/) · [Create an access key](https://docs.min.io/aistor/reference/cli/admin/mc-admin-accesskey/mc-admin-accesskey-create/) |
| Upyun S3 | `region: us-east-1`; `https://s3.api.upyun.com`; `forcePathStyle: true`; S3 credentials | [AWS S3 compatibility](https://help.upyun.com/knowledge-base/aws-s3%E5%85%BC%E5%AE%B9/) · [S3 API](https://help.upyun.com/knowledge-base/s3-api/) |

See the [operator setup directory](./docs/operator-setup-links.md#s3-compatible-publication) for least-privilege, public URL, and provider-specific prerequisites.

<details open>
<summary><strong>S3_CONFIG example and provider guidance</strong></summary>

```yaml
bucket: splatoon-assets
region: us-east-1
endpoint: https://s3.api.upyun.com
forcePathStyle: true
keyPrefix: splatoon3-bot
publicBaseUrl: https://splatoon.example.com
credentials:
  accessKeyId: your-s3-access-key
  secretAccessKey: your-s3-secret-access-key
```

For AWS S3, omit `endpoint`, normally leave `forcePathStyle` as `false`, and use the real AWS region. For S3-compatible providers such as Upyun, Cloudflare R2, or MinIO, use the provider's HTTPS endpoint and documented signing region. Explicit `credentials` are required so a self-hosted runner can never consume an unintended ambient role; `sessionToken` remains available for temporary credentials. Upyun users must create dedicated **S3 access credentials**; the former operator/password pair is not used.

The notification image is uploaded at `<keyPrefix>/notification-images/<sha256>/<name>.png`; the verified `2400×1350` source is retained at `<keyPrefix>/originals/<sha256>/<name>.png`. Every object is content-addressed and served with immutable caching, so messaging-platform media proxies cannot confuse one Bot Run with another. Publication rejects unexpected source geometry and binds exact keys, URLs, dimensions, hashes, byte counts, Run Manifest version, render time, and time zone in the Publication Manifest.

> [!TIP]
> Content-addressed objects intentionally accumulate. Configure an S3 lifecycle policy for `notification-images/` and `originals/` that matches how long links in historical messages should remain available.

</details>

### 3. Channel Secrets

| Repository Secret | Adapter |
| --- | --- |
| `BOT_WECOM_CONFIG` | WeCom |
| `BOT_DISCORD_CONFIG` | Discord |
| `BOT_TELEGRAM_CONFIG` | Telegram |
| `BOT_QQ_CONFIG` | QQ |
| `BOT_FEISHU_CONFIG` | Feishu |
| `BOT_DINGTALK_CONFIG` | DingTalk |
| `BOT_WHATSAPP_CONFIG` | WhatsApp Cloud API |
| `BOT_LINE_CONFIG` | LINE Messaging API |
| `BOT_SLACK_CONFIG` | Slack Incoming Webhook |

Each configured `BOT_*_CONFIG` Secret automatically enables its Channel adapter. An absent or empty Secret disables that adapter, so `BOT_NOTIFICATION_CHANNELS` and `BOT_CHANNEL_CONFIG` are not used.

Every Channel Secret must contain a direct, non-empty YAML sequence of Target mappings. Target `name` values must be unique within one Channel. YAML syntax, duplicate keys, unknown fields, and typed values are validated before delivery; quote identifiers that must remain strings.

Configured Channels and multiple Targets within each Channel run in parallel. Notifications for the same Target run in Run Profile order. The optional `notifications` array routes only selected Notification IDs to a Target; omit it to send every Notification in the active Run Profile. Valid IDs are `schedules`, `salmon-run`, `gear-dailydrop`, and `gear-regular`. A valid Channel with no Target matching the active Run Profile is intentionally skipped, so one Secret can safely contain schedule-only, Salmon Run-only, or gear-only destinations. Invalid YAML, invalid Targets, and attempted deliveries still fail visibly.

## Notification Channels

Every adapter speaks the platform's native visual language rather than flattening all messages into one generic webhook payload.

| Platform | Native presentation | Configuration Secret | Official setup |
| --- | --- | --- | --- |
| WeCom | Template Card | `BOT_WECOM_CONFIG` | [Group robot webhook](https://developer.work.weixin.qq.com/document/path/91770) |
| Discord | Image-rich Embed | `BOT_DISCORD_CONFIG` | [Create a webhook](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) |
| Telegram | Photo, safe HTML, inline URL button | `BOT_TELEGRAM_CONFIG` | [Create a bot with BotFather](https://core.telegram.org/bots/features#botfather) |
| QQ | Embed or custom Markdown | `BOT_QQ_CONFIG` | [Register an official bot](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/getting-started.html) |
| Feishu | Card Schema 2.0 | `BOT_FEISHU_CONFIG` | [Add a custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) |
| DingTalk | ActionCard | `BOT_DINGTALK_CONFIG` | [Custom robot access](https://open.dingtalk.com/document/robots/custom-robot-access) |
| WhatsApp | Approved media template | `BOT_WHATSAPP_CONFIG` | [Cloud API setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) |
| LINE | Flex Message bubble | `BOT_LINE_CONFIG` | [Create a Messaging API channel](https://developers.line.biz/en/docs/messaging-api/getting-started/) |
| Slack | Block Kit | `BOT_SLACK_CONFIG` | [Enable Incoming Webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) |

For required credentials, recipient eligibility, quotas, security modes, and additional official references, use the [complete operator setup directory](./docs/operator-setup-links.md#notification-adapters).

<details>
<summary><strong>WeCom</strong> · Template Cards with Notification routing</summary>

```yaml
- name: battle-schedules
  notifications: [schedules]
  webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
- name: salmon-run
  notifications: [salmon-run]
  webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
- name: gear
  notifications: [gear-dailydrop, gear-regular]
  webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
```

</details>

<details>
<summary><strong>Discord</strong> · Image-rich Embed</summary>

`username` and `avatarUrl` are optional webhook presentation overrides. The notification uses one image-rich Embed; its title is the primary clickable action, avoiding a dependency on webhook component permissions.

```yaml
- name: community
  webhookUrl: https://discord.com/api/webhooks/.../...
  username: Splatoon Bot
  avatarUrl: https://splatoon.example.com/icon.png
```

</details>

<details>
<summary><strong>Telegram</strong> · Photo-first layout and inline action</summary>

`chatId` accepts a string or integer. `messageThreadId` and `disableNotification` are optional. The adapter uses a photo-first layout, entity-safe HTML budgeting, and one URL-only inline button.

```yaml
- name: group-topic
  botToken: "123456:ABC..."
  chatId: "-1001234567890"
  messageThreadId: 42
  disableNotification: false
```

</details>

<details>
<summary><strong>QQ</strong> · Embed or custom Markdown</summary>

The adapter uses the official QQ Bot access-token flow. `targetType` is `channel`, `group`, or `user`. Group and user targets use custom Markdown. Channel targets default to the broadly available Embed format; set `messageFormat` to `markdown` only when that bot has QQ's channel custom-Markdown capability. `apiBaseUrl` and `tokenUrl` are optional test or proxy overrides.

```yaml
- name: official-group
  appId: "102..."
  clientSecret: "..."
  targetType: group
  targetId: GROUP_OPENID
- name: official-channel-with-markdown-access
  appId: "102..."
  clientSecret: "..."
  targetType: channel
  targetId: CHANNEL_ID
  messageFormat: markdown
```

</details>

<details>
<summary><strong>Feishu</strong> · Card Schema 2.0</summary>

`secret` is optional and enables signed custom-bot requests. The webhook-only adapter uses Card Schema 2.0 and an `open_url` button. Public screenshot URLs remain links because inline card images require an app-authenticated `image_key`.

```yaml
- name: team
  webhookUrl: https://open.feishu.cn/open-apis/bot/v2/hook/...
  secret: "..."
```

</details>

<details>
<summary><strong>DingTalk</strong> · ActionCard</summary>

`secret` is optional and enables signed custom-robot requests. Each notification uses an ActionCard with the screenshot in Markdown and a URL-only primary action.

```yaml
- name: team
  webhookUrl: https://oapi.dingtalk.com/robot/send?access_token=...
  secret: SEC...
```

</details>

<details>
<summary><strong>WhatsApp</strong> · Approved media template</summary>

The adapter uses Meta's Graph API `v25.0` and always sends an approved media template, so delayed scheduled runs never depend on a 24-hour customer-service window. Before configuring a Target, register a WhatsApp Business phone number, obtain explicit recipient opt-in, configure billing, and obtain approval for the exact template contract below. A synchronous success means Meta accepted the message; delivery receipts require a separate webhook receiver.

Create a named-parameter template named `splatoon_notification`:

- Submit the accurate category; recurring game updates should default to `MARKETING` unless Meta approves another category.
- Add an `IMAGE` header.
- Use body text `Splatoon 3 通知已更新\n\n{{title}}\n{{context}}\n{{details}}\n\n点击下方按钮查看完整截图。`.
- Add footer text `今天你喷喷了吗？`.
- Add one URL button named `查看截图` with URL `<exact S3_CONFIG.publicBaseUrl plus keyPrefix>/{{action_path}}`.

The adapter supplies the screenshot header plus the four named parameters, validates the approved URL prefix locally, inspects the real public image before sending, and rejects missing or mismatched image MIME types, unsupported media bytes, images above 5 MB, or malformed API acceptance responses. Meta throughput codes receive bounded retries; policy, template, and recipient errors fail with their official code and details.

```yaml
- name: personal-updates
  notifications: [schedules, salmon-run, gear-dailydrop, gear-regular]
  accessToken: EAA...
  phoneNumberId: "123456789012345"
  recipientPhoneNumber: "8613800000000"
  templateName: splatoon_notification
  languageCode: zh_CN
```

</details>

<details>
<summary><strong>LINE</strong> · Native Flex Message bubble</summary>

The adapter sends one native Flex Message bubble with an accent header, uncropped `16:9` screenshot hero, compact sections and facts, and a URL-only primary action. `targetType` is `user`, `group`, or `room`; the matching `targetId` must begin with `U`, `C`, or `R`. The recipient must be eligible for push delivery under LINE's Official Account rules.

The S3 publisher creates the actual `1024×576` PNG before upload, so LINE does not depend on provider-specific image processing. Before sending, the adapter downloads the public object and rejects missing or mismatched image MIME types, unsupported media bytes, dimensions above `1024×1024`, or files above 10 MB. Use `notification-smoke.yml` to verify public routing and destination eligibility before enabling scheduled delivery.

```yaml
- name: personal-chat
  channelAccessToken: "..."
  targetType: user
  targetId: U0123456789abcdef0123456789abcdef
  notificationDisabled: false
```

</details>

<details>
<summary><strong>Slack</strong> · Accessible Block Kit message</summary>

Create a Slack app, enable Incoming Webhooks, add an official `https://hooks.slack.com/services/...` or Slack Gov webhook to the destination channel, and store it in `BOT_SLACK_CONFIG`. The adapter uses Block Kit with accessible fallback text, a header, source context, screenshot, two-column facts, and a callback-free `mrkdwn` action link. It intentionally avoids Block Kit buttons because even URL buttons require an interaction acknowledgement endpoint, and it accepts delivery only when Slack returns the documented `ok` success token.

```yaml
- name: team-channel
  webhookUrl: https://hooks.slack.com/services/T.../B.../...
```

</details>

## Reliability

- The six Data Snapshot resources download concurrently with retries and timeouts, validate before publication, and replace the previous snapshot atomically. Invalid or partial data never replaces a valid snapshot.
- Archived Data Snapshots verify recorded byte counts and SHA-256 digests when loaded for notification delivery.
- Screenshot capture waits for application readiness, loaded fonts and images, exact viewport geometry, footer position, configured attribution, and zero overflow before writing an artifact atomically.
- Publication verifies the Run Profile, ordered artifact set, stable filenames, exact geometry, byte counts, and SHA-256 digests before any S3 request. It uploads only selected, content-addressed optimized and original PNG variants, then atomically writes a credential-free Publication Manifest bound to the Run Manifest version, Data Snapshot Manifest hash, original artifacts, render time, time zone, and screenshot attribution.
- The Run Manifest records the validated `BOT_TIME_ZONE` and `BOT_SCREENSHOT_ATTRIBUTION`; later stages reuse those exact render options instead of depending on runner state.
- Configuration Preflight validates the Run Profile, time zone, screenshot attribution, branding, S3 credentials, every configured Channel, and per-Target Notification routing before the first S3 request. Its report contains only status and counts, never Secret values.
- CI scans complete Git history with Gitleaks. Its digest-pinned image lives in `.github/gitleaks/Dockerfile` so Dependabot can maintain it, while one narrowly scoped historical fingerprint covers a deterministic LINE retry UUID fixture without weakening any credential rule.
- Channel adapters and Targets run concurrently, so one failure does not cancel work already running elsewhere. Successful deliveries remain successful, all results are retained, and failures are raised together as an `AggregateError`.
- The notification stage writes a per-Channel delivered, skipped, blocked, or rejected summary and fails the Bot Run only after every applicable configured Channel completes.

### Screenshot Fixtures

Visual tests use committed fixture JSON, local fixture images, a fixed render time, and committed golden PNGs. Successful external fixture image requests are forbidden, so tests never depend on the live `splatoon3.ink` image CDN.

Golden files use `1x` device scale to keep repository size manageable; structural assertions independently enforce production `2x` Screenshot Definitions. Pixel differences above `0.1%` fail the test and write diff images under `.cache/visual-diff/`.

Golden screenshots are platform-specific because Chrome uses different font rasterizers on macOS and Linux. Apple Silicon compares against `tests/golden/screenshots/darwin-arm64`; GitHub Actions and the OrbStack runner compare against `tests/golden/screenshots/linux-x64`. Both sets must contain every Screenshot Definition.

<details>
<summary><strong>Refresh fixtures and visual baselines intentionally</strong></summary>

```sh
pnpm run test:localize-fixture
pnpm run test:update-notification-golden
pnpm run test:update-golden
pnpm run test:visual
pnpm run verify
```

Review every changed image before accepting new golden PNGs. The local `act` runner image derives its pnpm, Chrome for Testing, and browser-installer versions from the checked-out project, avoiding repeated network bootstrap work inside OrbStack workflow containers.

</details>

## Local Development

This section is for contributors and advanced operators only; it is not required for GitHub Actions deployment.

### Requirements

- Node.js 24 LTS
- pnpm 11.18 or newer within major version 11

```sh
git clone git@github.com:YOUR_GITHUB_USERNAME/splatoon3-bot.git
cd splatoon3-bot
git remote add upstream https://github.com/TenviLi/splatoon3-bot.git
corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run download-data
pnpm run verify
```

Chrome does not need to be installed manually. The screenshot runtime downloads and caches the Chrome for Testing revision pinned by `puppeteer-core`. Set `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_CHANNEL`, or `PUPPETEER_BROWSER_VERSION` only for an explicit override.

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Start the Vite development server. |
| `pnpm run bot:doctor <profile> [channel]` | Validate configuration without publishing or sending. |
| `pnpm run bot:prepare <profile>` | Download data, build, render, and write the Run Manifest. |
| `pnpm run bot:publish <profile>` | Verify and publish selected screenshots through S3. |
| `pnpm run bot:notify <profile> [channel]` | Deliver all configured Channels or one selected Channel. |
| `pnpm run verify` | Run static checks, tests, visual contracts, build, and dependency audit. |
| `pnpm run verify:actions` | Scan Secrets and execute Linux CI plus a fixture-backed S3/WeCom run through OrbStack and `act`. |

## Contributing

Issues and focused pull requests are welcome. Before opening a PR:

1. Keep runtime behavior deterministic and preserve the Run Plan, Manifest, and adapter boundaries.
2. Add or update contract tests for behavior changes.
3. Review any changed screenshot or notification golden artifact deliberately.
4. Run `pnpm run verify` locally; use `pnpm run verify:actions` when changing GitHub Actions or Linux browser behavior.

For architectural changes, update [CONTEXT.md](./CONTEXT.md) or the relevant design document so code and project language evolve together.

## Legacy Migration

<details>
<summary><strong>Migrating the former single-WeCom configuration</strong></summary>

The old single-WeCom Secrets are intentionally unsupported:

- `SPLATOON_SCHEDULES_BOT_URL`
- `SPLATOON_SALMON_RUN_BOT_URL`
- `SPLATOON_GEAR_BOT_URL`

Replace them with `BOT_WECOM_CONFIG`, using the direct YAML Target sequence documented above. No compatibility fallback is provided.

The former `start:*` and WeCom-only `send-message:*` package aliases are also removed. Use the Run Profile-aware `bot:prepare`, `bot:publish`, and `bot:notify` commands so local operation follows the same validated path as GitHub Actions.

</details>

## License

Released under the [GNU General Public License v3.0](./LICENSE). Contributions are accepted under the same license.

---

<p align="center">
  <sub>Fan-made Splatoon tooling. This project is not affiliated with or endorsed by Nintendo.</sub>
</p>
