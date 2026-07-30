# splatoon3-bot

Splatoon 3 automation that turns one validated Data Snapshot into deterministic Screenshot Artifacts, publishes the selected PNG files to Upyun, and delivers platform-specific rich notifications.

The project currently provides adapters for WeCom, Discord, Telegram, QQ, Feishu, and DingTalk. Domain terminology is defined in [CONTEXT.md](./CONTEXT.md).

## Requirements

- Node.js 24 LTS
- pnpm 11.18 or newer within major version 11

Chrome does not need to be installed manually. The screenshot runtime downloads and caches the Chrome for Testing revision pinned by `puppeteer-core`. Set `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_CHANNEL`, or `PUPPETEER_BROWSER_VERSION` only when an explicit override is required.

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
| `pnpm run bot:describe <profile> [channels]` | Resolve a Run Profile and Notification Channel matrix. |
| `pnpm run bot:prepare <profile>` | Download data, build, render screenshots, and write the Run Manifest. |
| `pnpm run bot:publish <profile>` | Verify the Run Manifest and PNG hashes, then publish only selected screenshots. |
| `pnpm run bot:notify <profile> <channel>` | Deliver one Channel using `BOT_CHANNEL_CONFIG`. |
| `pnpm run test:unit` | Run Run Plan, Data Snapshot, adapter, delivery, Manifest, and publisher tests. |
| `pnpm run test:visual` | Compare deterministic local screenshots with committed golden PNGs. |
| `pnpm run verify` | Run actionlint, syntax checks, all tests, production build, and the full dependency audit. |

## Run Profiles

YAML selects only a Run Profile. Screenshot names, routes, dimensions, output filenames, notification ordering, Channel names, and Secret mappings are owned by `bot/run/RunPlan.mjs`.

| Run Profile | Screenshot Artifacts | Notifications |
| --- | --- | --- |
| `schedules` | `schedules.png` | `schedules` |
| `salmon-run` | `salmon-run.png` | `salmon-run` |
| `gear` | `gear-dailydrop.png`, `gear-regular.png` | `gear-dailydrop`, then `gear-regular` |
| `salmon-run-and-gear` | `salmon-run.png`, `gear-dailydrop.png`, `gear-regular.png` | Salmon Run, then both gear notifications |

Production Screenshot Definitions use a `1200×675` viewport at `2x` device scale, producing `2400×1350` PNG files.

## GitHub Actions

Scheduled and manual entry workflows call `.github/workflows/bot-reusable.yml`. A Bot Run has three ordered stages:

1. `prepare` downloads one complete Data Snapshot, builds the screenshot frontend, validates render structure, creates the selected Screenshot Artifacts, and archives the Bot Run for seven days.
2. `publish` downloads the archive, validates the Run Manifest plus every selected PNG byte count and SHA-256 digest, stages only those PNG files, and syncs them to Upyun.
3. `notify` fans out one matrix job per enabled Notification Channel after publication succeeds.

Official GitHub Actions are pinned to immutable commit SHAs. CI runs `pnpm run verify` for pushes to `main`, pull requests, and manual verification runs.

The `publish` and `notify` jobs use the `production` GitHub Environment. Configure its deployment-branch policy and optional required reviewers to prevent untrusted refs from using production credentials.

The scheduled entry points are:

- `bot-schedules.yml`: `schedules` every two hours.
- `bot-salmon-run.yml`: `salmon-run-and-gear` at `02:00` and `10:00` UTC.
- `bot-manual.yml`: manually selects any Run Profile and optionally overrides enabled Channels.
- `notification-smoke.yml`: manually runs the complete prepare, publish, and notify flow for one Channel; it is not side-effect free.

## Repository Configuration

Configure these under **Settings → Secrets and variables → Actions**.

### Variables

| Repository Variable | Description |
| --- | --- |
| `BOT_NOTIFICATION_CHANNELS` | Comma-separated enabled Channels, for example `wecom,discord,telegram`. Values are normalized, deduplicated, and default to `wecom`. |
| `UPYUN_DOMAIN` | Public asset origin used in notification images and links, for example `https://splatoon.example.com`. |

The manual workflow input `notification_channels` takes precedence over `BOT_NOTIFICATION_CHANNELS`.

### Secrets

| Repository Secret | Description |
| --- | --- |
| `UPYUN_BUCKET` | Upyun service name. |
| `UPYUN_OPERATOR` | Upyun operator. |
| `UPYUN_SECRET` | Upyun operator password. |
| `BOT_WECOM_CONFIG` | WeCom Target array. |
| `BOT_DISCORD_CONFIG` | Discord Target array. |
| `BOT_TELEGRAM_CONFIG` | Telegram Target array. |
| `BOT_QQ_CONFIG` | QQ Target array. |
| `BOT_FEISHU_CONFIG` | Feishu Target array. |
| `BOT_DINGTALK_CONFIG` | DingTalk Target array. |

Only Secrets for enabled Channels are required. `BOT_CHANNEL_CONFIG` is an internal workflow environment variable and should not be created in repository settings.

## Notification Targets

Every Channel Secret must contain a direct, non-empty JSON array of Target objects. Target `name` values must be unique within one Channel. Schemas are strict, so unknown fields fail configuration validation instead of being silently ignored.

Multiple Targets in one Channel run in parallel. Notifications for the same Target run in Run Profile order.

### WeCom

```json
[
  {
    "name": "primary",
    "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
  }
]
```

### Discord

`username` and `avatarUrl` are optional webhook presentation overrides.

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

`chatId` accepts a string or integer. `messageThreadId` and `disableNotification` are optional.

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

The adapter uses the official QQ Bot access-token flow. `targetType` is `channel`, `group`, or `user`. `apiBaseUrl` and `tokenUrl` are optional test or proxy overrides.

```json
[
  {
    "name": "official-group",
    "appId": "102...",
    "clientSecret": "...",
    "targetType": "group",
    "targetId": "GROUP_OPENID"
  }
]
```

### Feishu

`secret` is optional and enables signed custom-bot requests.

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

`secret` is optional and enables signed custom-robot requests.

```json
[
  {
    "name": "team",
    "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=...",
    "secret": "SEC..."
  }
]
```

## Failure Semantics

- The six Data Snapshot resources download concurrently with retries and timeouts, validate before publication, and replace the previous snapshot atomically. Invalid or partial data never replaces a valid snapshot.
- Archived Data Snapshots verify their recorded byte counts and SHA-256 digests when loaded by notification jobs.
- Screenshot capture waits for the application readiness seam, loaded fonts and images, exact viewport geometry, footer position, and zero overflow before writing an artifact atomically.
- Publication verifies the Run Profile, ordered artifact set, stable filenames, byte counts, and SHA-256 digests. `run-manifest.json` and unrelated files are never uploaded to Upyun.
- Channel matrix jobs use `fail-fast: false`, so one platform failure does not cancel other platforms.
- Targets inside a Channel run in parallel. Successful deliveries remain successful when another Target fails; all results are retained and failures are raised together as an `AggregateError`.
- The final summary marks the Bot Run failed if prepare, publish, or any notification job failed.

## Screenshot Fixtures

Visual tests use committed fixture JSON, local fixture images, a fixed render time, and committed golden PNGs. Successful external fixture image requests are forbidden, so the test does not depend on the live `splatoon3.ink` image CDN.

Golden files use `1x` device scale to keep repository size manageable; structural assertions independently enforce the production `2x` Screenshot Definitions. Pixel differences above `0.1%` fail the test and write diff images under `.cache/visual-diff/`.

After intentionally refreshing fixture JSON from live data, update assets and baselines in this order:

```sh
pnpm run test:localize-fixture
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
