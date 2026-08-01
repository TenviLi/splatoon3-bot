<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <strong>日本語</strong>
</p>

<p align="center">
  <img src="./src/assets/img/favicon.svg" width="96" height="96" alt="splatoon3-bot ロゴ">
</p>

<h1 align="center">splatoon3-bot</h1>

<p align="center">
  再現可能な『スプラトゥーン3』画像を生成し、各プラットフォーム固有のリッチメッセージで配信します。<br>
  検証済みの Data Snapshot から、信頼できる 1 回の Bot Run ですべてのコミュニティへ。
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> ·
  <a href="#スクリーンショット">スクリーンショット</a> ·
  <a href="#リポジトリ設定">リポジトリ設定</a> ·
  <a href="#通知プラットフォーム">通知プラットフォーム</a> ·
  <a href="#ローカル開発">ローカル開発</a>
</p>

## 特長

- **GitHub Actions だけで運用**：サーバー、Node.js、pnpm、Chrome、Docker のローカル導入は不要です。
- **決定論的な画像生成**：データ、時刻、Viewport、フォント、画像読み込み、レイアウトを固定し、macOS/Linux の golden で検証します。
- **汎用 S3 配信**：AWS S3、Cloudflare R2、MinIO、Upyun S3、その他の SigV4 互換ストレージに対応します。
- **9 種類のネイティブ通知**：WeCom、Discord、Telegram、QQ、Feishu、DingTalk、WhatsApp、LINE、Slack。
- **安全な設定境界**：Secrets と Variables は利用者自身の Private repository にのみ保存し、外部処理の前に設定を検証します。

## スクリーンショット

### 4 種類の決定論的 Screenshot Artifact

<table>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/schedules.png" alt="バトルスケジュール"><br><sub><code>schedules.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/salmon-run.png" alt="サーモンラン"><br><sub><code>salmon-run.png</code></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-dailydrop.png" alt="今日のピックアップギア"><br><sub><code>gear-dailydrop.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-regular.png" alt="販売中のギア"><br><sub><code>gear-regular.png</code></sub></td>
  </tr>
</table>

本番画像は `2400×1350` PNG、通知用画像は `1024×576` です。フッターの既定値は `splatoon3.ink` で、WeCom アイコンは表示しません。

## クイックスタート

### 自分の Private repository に Fork して実行する

各利用者は、自分の GitHub アカウントにある Private repository でこのプロジェクトを実行・カスタマイズします。そのリポジトリが独立したデプロイおよび信頼境界となり、Schedules、Secrets、Variables、Environments、コード変更を所有者が管理します。

<p align="center">
  <a href="https://github.com/TenviLi/splatoon3-bot/fork"><strong>Private installation を Fork →</strong></a>
</p>

> [!TIP]
> ホスト運用に必要なのは GitHub Actions、S3 互換バケット、1 つ以上の通知先だけです。**Node.js、pnpm、Chrome、Docker、専用サーバーのインストールは不要です。**

> [!IMPORTANT]
> 上流が Private で Fork が許可されている場合は **Fork** を使えます。上流が Public になった場合、Public repository の Fork を個別に Private へ変更することはできないため、**Use this template** または [GitHub Importer](https://github.com/new/import) で独立した Private repository を作成してください。

| 用意するもの | 保存先 | 設定ガイド |
| --- | --- | --- |
| 公開 HTTPS の通知アイコン URL 3 個 | Repository Variable `BOT_BRANDING_CONFIG` | [Variables](#1-repository-variables) |
| S3 アップロード認証情報と公開 URL | Repository Secret `S3_CONFIG` | [S3 設定](#2-s3_config) |
| 1 つ以上の通知先 | 対応する Repository Secret `BOT_*_CONFIG` | [通知プラットフォーム](#通知プラットフォーム) |

1. 上流が Private のままで Fork が許可されている場合は、上のリンクから自分の GitHub アカウントに Private Fork を作成します。Fork できない場合、または上流が Public になった場合は、**Use this template** か [GitHub Importer](https://github.com/new/import) で独立した Private copy を作成します。
2. そのリポジトリの <kbd>Actions</kbd> を開き、必要なら Workflow を許可し、**Splatoon3 Bot (every 2 hours)** と **Splatoon3 Bot (daily twice)** が有効であることを確認します。
3. <kbd>Settings</kbd> → <kbd>Secrets and variables</kbd> → <kbd>Actions</kbd> を開きます。
4. **Variables** タブに `BOT_BRANDING_CONFIG`、**Secrets** タブに `S3_CONFIG` を追加します。
5. [通知プラットフォーム](#通知プラットフォーム)から利用するサービスを選び、公式ガイドに従って Bot/Webhook を作成し、対応する `BOT_*_CONFIG` Secret を追加します。Secret が存在する adapter だけが自動的に有効になります。`BOT_NOTIFICATION_CHANNELS` は不要です。
6. Actions から **Check Bot Configuration** を `all` Profile で実行します。YAML、S3、通知ルーティングだけを確認し、アップロードや送信は行いません。
7. 通知先ごとに **Notification Channel smoke test** を実行します。S3 と実メッセージを確認してから定期 Workflow を利用してください。

> [!CAUTION]
> 実際の認証情報、Webhook、Token、電話番号、Target ID を Git、Pull Request、ログ、Repository Variables に保存しないでください。上流変更を取り込む前に `.github/workflows/`、`bot/`、`scripts/` を確認してください。

## リポジトリ設定

すべての値は自分の Private repository の <kbd>Settings</kbd> → <kbd>Secrets and variables</kbd> → <kbd>Actions</kbd> に設定します。

### 1. Repository Variables

| Variable | 必須 | 既定値 | 用途 |
| --- | :---: | --- | --- |
| `BOT_BRANDING_CONFIG` | 必須 | — | 公開 HTTPS 通知アイコン URL 3 個を含む YAML。 |
| `BOT_TIME_ZONE` | 任意 | `Asia/Shanghai` | 画像と通知で共有する IANA タイムゾーン。 |
| `BOT_SCREENSHOT_ATTRIBUTION` | 任意 | `splatoon3.ink` | 画像フッターの短いクレジット。最大 40 文字。 |
| `BOT_RUNNER` | 任意 | `ubuntu-24.04` | GitHub Actions Runner ラベル。 |
| `BOT_ENVIRONMENT` | 任意 | `production` | Publish Job が使用する GitHub Environment。 |
| `BOT_CONCURRENCY_GROUP` | 任意 | `splatoon3-bot-production` | 本番 Bot Run を直列化する concurrency group。 |
| `BOT_ARTIFACT_RETENTION_DAYS` | 任意 | `7` | Artifact 保存日数。1〜90。 |

`BOT_BRANDING_CONFIG` の例：

```yaml
icons:
  schedules: https://assets.example.com/icon.png
  salmonRun: https://assets.example.com/icon2.png
  gear: https://assets.example.com/icon3.png
```

これらは公開表示用 URL なので Variable に保存します。資格情報や query token を URL に含めないでください。

### 2. `S3_CONFIG`

`S3_CONFIG` は配信用の唯一の Secret で、1 つの厳密な YAML mapping を使用します。

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

- `endpoint`：GitHub Actions がアップロードに使う S3 API。AWS S3 では通常省略します。
- `publicBaseUrl`：各通知サービスが画像を取得する公開 HTTPS root。`keyPrefix` は含めません。
- `keyPrefix`：任意の Object prefix。
- `credentials`：対象 Bucket に必要な最小権限だけを与えた専用資格情報を推奨します。

| ストレージ | 公式セットアップ |
| --- | --- |
| AWS S3 | [Bucket を作成](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html#creating-bucket) · [Access Key を管理](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) |
| Cloudflare R2 | [Get started](https://developers.cloudflare.com/r2/get-started/) · [API Token](https://developers.cloudflare.com/r2/api/tokens/) · [Public bucket](https://developers.cloudflare.com/r2/buckets/public-buckets/) |
| MinIO / AIStor | [Bucket を作成](https://docs.min.io/aistor/reference/cli/mc-mb/) · [Access Key を作成](https://docs.min.io/aistor/reference/cli/admin/mc-admin-accesskey/mc-admin-accesskey-create/) |
| Upyun S3 | [AWS S3 互換](https://help.upyun.com/knowledge-base/aws-s3%E5%85%BC%E5%AE%B9/) · [S3 API](https://help.upyun.com/knowledge-base/s3-api/) |

最小権限、公開 URL、Provider ごとの注意点は[運用者向けセットアップ一覧](./docs/operator-setup-links.md#s3-compatible-publication)を参照してください。

### 3. Channel Secrets

各 Channel Secret は、Target mapping の直接かつ空でない YAML sequence です。各 Target には一意な `name` が必要です。任意の `notifications` で配信対象を限定できます。

```yaml
- name: battle-schedules
  notifications: [schedules]
  webhookUrl: https://example.com/secret-webhook
- name: gear
  notifications: [gear-dailydrop, gear-regular]
  webhookUrl: https://example.com/another-secret-webhook
```

複数 Channel と同一 Channel 内の複数 Target は並列で実行されます。同一 Target 内の通知順序は Run Profile の定義どおりです。

## 通知プラットフォーム

| Platform | Repository Secret | 必須フィールド | 表現 | 公式ガイド |
| --- | --- | --- | --- | --- |
| WeCom | `BOT_WECOM_CONFIG` | `name`, `webhookUrl` | Template Card | [Group robot webhook](https://developer.work.weixin.qq.com/document/path/91770) |
| Discord | `BOT_DISCORD_CONFIG` | `name`, `webhookUrl` | Embed | [Webhook を作成](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) |
| Telegram | `BOT_TELEGRAM_CONFIG` | `name`, `botToken`, `chatId` | Photo、HTML、URL button | [BotFather](https://core.telegram.org/bots/features#botfather) |
| QQ official bot | `BOT_QQ_CONFIG` | `name`, `appId`, `clientSecret`, `targetType`, `targetId` | Embed / Markdown | [Bot を登録](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/getting-started.html) |
| Feishu | `BOT_FEISHU_CONFIG` | `name`, `webhookUrl` | Card Schema 2.0 | [Custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) |
| DingTalk | `BOT_DINGTALK_CONFIG` | `name`, `webhookUrl` | ActionCard | [Custom robot](https://open.dingtalk.com/document/robots/custom-robot-access) |
| WhatsApp | `BOT_WHATSAPP_CONFIG` | `name`, `accessToken`, `phoneNumberId`, `recipientPhoneNumber`, `templateName`, `languageCode` | 承認済み media template | [Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) |
| LINE | `BOT_LINE_CONFIG` | `name`, `channelAccessToken`, `targetType`, `targetId` | Flex Message | [Messaging API](https://developers.line.biz/en/docs/messaging-api/getting-started/) |
| Slack | `BOT_SLACK_CONFIG` | `name`, `webhookUrl` | Block Kit | [Incoming Webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) |

全フィールド、受信資格、署名方式、quota、追加の公式資料は[運用者向けセットアップ一覧](./docs/operator-setup-links.md#notification-adapters)を参照してください。英語版 README には各 platform の YAML 例と表示設計も掲載しています。

### WeCom の例

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

## 自動化と信頼性

`Data Snapshot → Build → Screenshots → Configuration Preflight → S3 → Channel Adapters`

- `bot-schedules.yml` は残りの偶数 UTC 時に `schedules` を配信します。
- `bot-salmon-run.yml` は `02:00` と `10:00` UTC に `all` Profile で 4 種類を配信します。
- 2 つの Workflow を合わせ、スケジュール通知は 2 時間ごとに正確に 1 回です。
- Remote Action は immutable commit SHA に固定し、CI は Gitleaks で Git 履歴全体を検査します。
- 画像、Run Manifest、Publication Manifest、S3 object、通知 URL を寸法、hash、Data Snapshot、時刻、attribution で結び付けます。
- 1 つの Channel の失敗で、他の開始済み Channel をキャンセルしません。すべての結果を集約してから Job を失敗させます。

## ローカル開発

この節は contributor と高度な operator 向けです。GitHub Actions での通常運用には不要です。

**要件：** Node.js 24 LTS、pnpm 11.18 以上の 11.x。

```sh
git clone git@github.com:YOUR_GITHUB_USERNAME/splatoon3-bot.git
cd splatoon3-bot
git remote add upstream https://github.com/TenviLi/splatoon3-bot.git
corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run verify
```

- `pnpm run bot:doctor all`：副作用なしのローカル設定検証。
- `pnpm run verify`：構文、unit、browser、visual golden、build、dependency audit。
- `pnpm run verify:actions`：OrbStack と `act` で Linux CI、S3、WeCom のローカル fake endpoint を含む全経路を検証。

## ライセンス

[GNU GPL v3.0](./LICENSE) で公開しています。本プロジェクトはファンメイドであり、Nintendo とは関係なく、承認も受けていません。
