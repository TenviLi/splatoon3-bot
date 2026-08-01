<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="./src/assets/img/favicon.svg" width="96" height="96" alt="splatoon3-bot logo">
</p>

<h1 align="center">splatoon3-bot</h1>

<p align="center">
  Deterministic Splatoon 3 screenshots and native rich notifications.<br>
  Fork once, configure GitHub, and let Actions operate the bot for you.
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

`splatoon3-bot` turns one validated [Splatoon 3](https://splatoon3.ink/) Data Snapshot into reproducible Screenshot Artifacts, publishes optimized and original PNG files through any compatible S3 service, and delivers carefully designed messages to every configured destination.

<table>
  <tr>
    <td width="33%" align="center"><strong>Deterministic rendering</strong><br><sub>Fixed data, time, locale, viewport, fonts, image readiness, geometry, and visual goldens.</sub></td>
    <td width="33%" align="center"><strong>Portable publication</strong><br><sub>AWS S3, Cloudflare R2, MinIO, Upyun S3, and other SigV4-compatible object stores.</sub></td>
    <td width="33%" align="center"><strong>Native presentation</strong><br><sub>Template Cards, Embeds, Flex Messages, Block Kit, and approved media templates.</sub></td>
  </tr>
  <tr>
    <td width="33%" align="center"><strong>Parallel delivery</strong><br><sub>Channels and Targets run concurrently while preserving notification order per destination.</sub></td>
    <td width="33%" align="center"><strong>Manifest integrity</strong><br><sub>Hashes, URLs, dimensions, render options, and Data Snapshot identity stay bound end to end.</sub></td>
    <td width="33%" align="center"><strong>CI-first operations</strong><br><sub>Immutable Actions, strict YAML, protected Environments, audits, and local Linux verification.</sub></td>
  </tr>
</table>

Nine adapters are included: **WeCom, Discord, Telegram, QQ, Feishu, DingTalk, WhatsApp, LINE, and Slack**. See [CONTEXT.md](./CONTEXT.md) for domain terminology and [notification platform capabilities](./docs/notification-platform-capabilities.md) for the native-message design audit.

## Preview

### View all four deterministic Screenshot Artifacts

<table>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/schedules.png" alt="English battle schedules screenshot"><br><sub><code>schedules.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/salmon-run.png" alt="English Salmon Run screenshot"><br><sub><code>salmon-run.png</code></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-dailydrop.png" alt="English SplatNet Gear Daily Drop screenshot"><br><sub><code>gear-dailydrop.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-regular.png" alt="English SplatNet Gear on-sale screenshot"><br><sub><code>gear-regular.png</code></sub></td>
  </tr>
</table>

The logical viewport stays `1200×675`. `BOT_SCREENSHOT_RESOLUTION` selects an exact 16:9 output preset, while publication always creates a platform-friendly `1024×576` notification image.

## Quick Start

### Run in Your Own Private Repository

Each installation belongs in a Private repository under the operator's GitHub account. That repository is the deployment and trust boundary: it owns the code, schedules, Repository Secrets, Repository Variables, Environment rules, and delivery destinations.

<p align="center">
  <a href="https://github.com/TenviLi/splatoon3-bot/fork"><strong>Fork or create your private installation →</strong></a>
</p>

> [!TIP]
> Hosted operation needs only GitHub Actions, one S3-compatible bucket, and one messaging destination. **You do not need to install Node.js, pnpm, Chrome, Docker, or a server.**

1. Create the installation under your own GitHub account. Use **Fork** when the source visibility and organization policy allow a Private fork. Because [public repository forks are always public](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-permissions-and-visibility-of-forks#visibility-of-forks), use [GitHub Importer](https://github.com/new/import) or an independent Private mirror when a Private fork is unavailable.
2. Create the `S3_CONFIG` Repository Secret from the [copy-ready example](#s3_config).
3. Create at least one Channel Secret. The English quick start uses Discord:

   ```yaml
   - name: splatoon-community
     webhookUrl: https://discord.com/api/webhooks/.../...
     username: Splatoon Bot
   ```

   Save it as the Repository Secret `BOT_DISCORD_CONFIG`. Follow Discord's [webhook setup guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks), or choose another platform from [Notification Channels](#notification-channels).
4. Create the Repository Variable `BOT_LOCALE` with value `en-US`. Set `BOT_TIME_ZONE` to your [IANA time zone](https://www.iana.org/time-zones), then add `BOT_SCREENSHOT_RESOLUTION` or another [Repository Variable](#repository-variables) only when its default is unsuitable.
5. Open <kbd>Actions</kbd>, enable workflows if GitHub asks, and run **Check Bot Configuration** with profile `all`. It validates configuration without uploading or sending.
6. Run **Notification Channel smoke test** for the configured Channel. This deliberate side-effecting check publishes current output and sends one real message before scheduled delivery is trusted.

> [!IMPORTANT]
> Configure credentials only in the operator's Private repository—never in this source repository, committed files, pull requests, or copied logs. Repository Secrets and Variables are intentionally installation-local.

> [!CAUTION]
> Workflows on the installation's default branch can consume its credentials. Review incoming changes—especially `.github/workflows/`, `bot/`, and `scripts/`—before merging or synchronizing them. Rotate any credential that is ever committed.

## Automation

<p align="center">
  <strong>Data Snapshot</strong> → <strong>Build</strong> → <strong>Screenshots</strong> → <strong>Preflight</strong> → <strong>S3</strong> → <strong>Channels</strong>
</p>

Scheduled and manual entry workflows call one reusable two-stage pipeline:

1. **Prepare** downloads and validates one Data Snapshot, builds the screenshot frontend, renders the selected screenshots, and archives the complete Bot Run.
2. **Publish and notify** downloads that archive once, validates all configuration before side effects, publishes images and built-in icons through S3, then fans out configured Channels and Targets in parallel from one Node.js process.

| Workflow | Trigger | Run Profile |
| --- | --- | --- |
| `bot-schedules.yml` | Remaining even UTC hours | `schedules` |
| `bot-salmon-run.yml` | `02:00` and `10:00` UTC | `all` |
| `bot-manual.yml` | Manual selection | Any profile |
| `configuration-check.yml` | Manual selection | Preflight only; no upload or message |
| `notification-smoke.yml` | Manual profile and Channel | Complete side-effecting smoke run |

Together, scheduled workflows deliver schedules exactly once every two hours. Official Actions are pinned to immutable commit SHAs. GitHub Actions is the only supported hosted automation surface.

<details>
<summary><strong>Run Profiles</strong></summary>

| Profile | Screenshot Artifacts | Notifications |
| --- | --- | --- |
| `schedules` | `schedules.png` | Schedules |
| `salmon-run` | `salmon-run.png` | Salmon Run |
| `gear` | Both gear images | Both gear notifications |
| `salmon-run-and-gear` | Salmon Run and both gear images | Salmon Run, then both gear notifications |
| `all` | All four images | All four notifications |

</details>

## Configuration

Configure values under <kbd>Settings</kbd> → <kbd>Secrets and variables</kbd> → <kbd>Actions</kbd> in the installation repository.

| Layer | GitHub setting | Required |
| --- | --- | :---: |
| Rendering and workflow choices | Repository Variables | No; stable defaults are built in |
| Image publication | Repository Secret `S3_CONFIG` | Yes |
| Message destinations | Any `BOT_*_CONFIG` Repository Secret | No; add at least one to deliver messages |

The `publish` Job uses the `production` GitHub Environment by default. Use its deployment-branch policy or required reviewers to gate credential use, or change the Environment with `BOT_ENVIRONMENT`.

### Repository Variables

| Repository Variable | Allowed values / default | Purpose |
| --- | --- | --- |
| `BOT_LOCALE` | `en-US`, `zh-CN`, `ja-JP`; default `zh-CN` | Language shared by screenshots and notification copy. |
| `BOT_SCREENSHOT_RESOLUTION` | `1200x675`, `1920x1080`, `2400x1350`, `3840x2160`; default `2400x1350` | Exact original Screenshot Artifact size. |
| `BOT_TIME_ZONE` | IANA time zone; default `Asia/Shanghai` | Time zone shared by screenshots and notification formatting. |
| `BOT_SCREENSHOT_ATTRIBUTION` | Up to 40 characters; default `splatoon3.ink` | Platform-neutral footer credit. |
| `BOT_RUNNER` | Default `ubuntu-24.04` | Runner label for both Bot Run stages. |
| `BOT_ENVIRONMENT` | Default `production` | GitHub Environment that gates publication. |
| `BOT_CONCURRENCY_GROUP` | Default `splatoon3-bot-production` | Serializes production Bot Runs. |
| `BOT_ARTIFACT_RETENTION_DAYS` | `1`–`90`; default `7` | Retention for archived Bot Runs. |

Resolution presets retain the same CSS layout and use the corresponding device scale factor:

| Preset | Scale | Good default for |
| --- | :---: | --- |
| `1200x675` | 1× | Small artifacts and visual fixtures |
| `1920x1080` | 1.6× | Full HD archives |
| `2400x1350` | 2× | Recommended balance of detail and size |
| `3840x2160` | 3.2× | 4K originals; larger artifacts and uploads |

Built-in schedules, Salmon Run, and gear icons are rendered from repository assets and published under content-addressed `branding-icons/` keys. No external icon provisioning is required.

### `S3_CONFIG`

Create one Repository Secret named `S3_CONFIG` containing a strict YAML mapping:

```yaml
bucket: splatoon-assets
publicBaseUrl: https://splatoon.example.com
accessKeyId: your-s3-access-key
secretAccessKey: your-s3-secret-access-key
region: us-east-1
endpoint: https://s3.example.com
forcePathStyle: true
keyPrefix: splatoon3-bot
```

**Required fields**

| Field | Purpose |
| --- | --- |
| `bucket` | Destination bucket name. |
| `publicBaseUrl` | Credential-free public HTTPS bucket-root or CDN URL. Do not append `keyPrefix`. |
| `accessKeyId` | Dedicated S3-compatible access key with upload permission; object inspection avoids redundant icon uploads when allowed. |
| `secretAccessKey` | Secret key paired with `accessKeyId`. |

**Optional fields**

| Field | Default | When to set it |
| --- | --- | --- |
| `region` | `us-east-1` | Use the provider's signing region; R2 uses `auto`. |
| `endpoint` | AWS SDK default | Required by R2, MinIO, Upyun S3, and other compatible services. |
| `forcePathStyle` | `false` | Commonly `true` for MinIO and Upyun S3. |
| `keyPrefix` | Empty | Namespace all project objects, for example `splatoon3-bot`. |
| `sessionToken` | Empty | Temporary session credentials only. |

`endpoint` is the upload API; `publicBaseUrl` is the read URL fetched by messaging platforms. The publisher creates content-addressed notification images, originals, and built-in branding icons, verifies exact geometry and hashes, and never exposes credentials in its Publication Manifest.

| Provider | Official setup |
| --- | --- |
| AWS S3 / CloudFront | [Create a bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html#creating-bucket) · [Manage access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) · [CloudFront OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) |
| Cloudflare R2 | [Get started](https://developers.cloudflare.com/r2/get-started/) · [API tokens](https://developers.cloudflare.com/r2/api/tokens/) · [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) |
| MinIO / AIStor | [Create a bucket](https://docs.min.io/aistor/reference/cli/mc-mb/) · [Create an access key](https://docs.min.io/aistor/reference/cli/admin/mc-admin-accesskey/mc-admin-accesskey-create/) |
| Upyun S3 | [S3 compatibility](https://help.upyun.com/knowledge-base/aws-s3%E5%85%BC%E5%AE%B9/) · [S3 API](https://help.upyun.com/knowledge-base/s3-api/) |

See the [complete S3 operator guide](./docs/operator-setup-links.md#s3-compatible-publication) for provider prerequisites and least-privilege guidance.

> [!TIP]
> Content-addressed objects intentionally accumulate. Configure an S3 lifecycle policy for `notification-images/` and `originals/` that matches how long links in historical messages should remain available.

## Notification Channels

Each configured Channel Secret automatically enables its adapter; an absent or empty Secret disables it. `BOT_NOTIFICATION_CHANNELS` and a combined `BOT_CHANNEL_CONFIG` are unnecessary.

Every Channel Secret must contain a direct, non-empty YAML sequence of Target mappings. Each Target needs a unique `name`; add `notifications: [schedules, salmon-run, gear-dailydrop, gear-regular]` only to restrict routing. Channels and Targets execute concurrently, while notifications for one Target retain Run Profile order.

| Platform | Native presentation | Repository Secret | Official setup |
| --- | --- | --- | --- |
| WeCom | `news_notice` Template Card | `BOT_WECOM_CONFIG` | [Group robot](https://developer.work.weixin.qq.com/document/path/91770) |
| Discord | Image-rich Embed | `BOT_DISCORD_CONFIG` | [Incoming Webhook](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) |
| Telegram | Photo, safe HTML, URL button | `BOT_TELEGRAM_CONFIG` | [BotFather](https://core.telegram.org/bots/features#botfather) |
| QQ | Embed or custom Markdown | `BOT_QQ_CONFIG` | [Official bot](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/getting-started.html) |
| Feishu / Lark | Card Schema 2.0 | `BOT_FEISHU_CONFIG` | [Custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) |
| DingTalk | ActionCard | `BOT_DINGTALK_CONFIG` | [Custom robot](https://open.dingtalk.com/document/robots/custom-robot-access) |
| WhatsApp | Approved media template | `BOT_WHATSAPP_CONFIG` | [Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) |
| LINE | Flex Message bubble | `BOT_LINE_CONFIG` | [Messaging API](https://developers.line.biz/en/docs/messaging-api/getting-started/) |
| Slack | Block Kit | `BOT_SLACK_CONFIG` | [Incoming Webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) |

The [operator setup directory](./docs/operator-setup-links.md#notification-adapters) lists every required Target field, credential prerequisite, recipient rule, and first-party setup link. The [capability audit](./docs/notification-platform-capabilities.md) explains why each adapter uses its current native layout.

## Reliability

- Data Snapshot resources download concurrently with retries and timeouts, validate before publication, and replace the previous snapshot atomically.
- Screenshot capture waits for application readiness, fonts, local images, exact geometry, footer position, locale, attribution, and zero overflow.
- Run Manifest v4 records locale, resolution, time zone, Data Snapshot identity, dimensions, hashes, and stable filenames.
- Publication Manifest v3 binds the exact Run Manifest to optimized images, originals, and built-in branding icons under one public asset namespace.
- Configuration Preflight reports all independent errors before the first upload and never prints Secret values.
- Channel and Target delivery preserves partial success and raises aggregated failures only after all applicable work settles.
- CI scans the complete Git history with a digest-pinned Gitleaks image, then runs syntax, unit, browser, visual, build, workflow-policy, and dependency-audit checks.

Visual tests maintain all four screenshots in English, Simplified Chinese, and Japanese for macOS and Linux. Fixture network access is local-only, and pixel differences above `0.1%` fail validation.

## Local Development

This section is for contributors and advanced operators; it is not required for hosted operation.

**Requirements:** Node.js 24 LTS and pnpm 11.18 or newer within major version 11.

```sh
git clone git@github.com:YOUR_GITHUB_USERNAME/splatoon3-bot.git
cd splatoon3-bot
git remote add upstream https://github.com/TenviLi/splatoon3-bot.git
corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run download-data
pnpm run verify
```

| Command | Purpose |
| --- | --- |
| `pnpm run bot:doctor <profile> [channel]` | Validate configuration without side effects. |
| `pnpm run bot:prepare <profile>` | Download, build, render, and write the Run Manifest. |
| `pnpm run bot:publish <profile>` | Verify and publish through S3. |
| `pnpm run bot:notify <profile> [channel]` | Deliver configured Channels. |
| `pnpm run test:update-golden` | Regenerate all three screenshot locales for the current platform. |
| `pnpm run verify` | Run the complete focused local verification suite. |
| `pnpm run verify:actions` | Run Gitleaks and Linux Actions locally through OrbStack and `act`. |

## Contributing

Keep behavior deterministic, preserve Run Plan and Manifest boundaries, update contract tests for behavior changes, and review every changed image or payload golden deliberately. Run `pnpm run verify` before opening a pull request; use `pnpm run verify:actions` when changing Actions or Linux browser behavior.

## License

Released under the [GNU General Public License v3.0](./LICENSE). This fan-made project is not affiliated with or endorsed by Nintendo.
