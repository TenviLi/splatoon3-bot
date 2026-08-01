<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="./src/assets/img/favicon.svg" width="96" height="96" alt="splatoon3-bot 标志">
</p>

<h1 align="center">splatoon3-bot</h1>

<p align="center">
  稳定生成 Splatoon 3 截图，并以各平台原生富消息推送。<br>
  创建一份私有安装、配置 GitHub，后续交给 Actions 自动运行。
</p>

<p align="center">
  <a href="https://github.com/TenviLi/splatoon3-bot/actions/workflows/ci.yml"><img alt="验证工作流" src="https://github.com/TenviLi/splatoon3-bot/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="GitHub Actions 托管" src="https://img.shields.io/badge/运行-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white">
  <img alt="九个通知适配器" src="https://img.shields.io/badge/通知适配器-9-6F42C1">
  <img alt="兼容 S3" src="https://img.shields.io/badge/存储-S3%20compatible-569A31?logo=amazons3&logoColor=white">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#截图预览">截图预览</a> ·
  <a href="#配置">配置</a> ·
  <a href="#通知平台">通知平台</a> ·
  <a href="#可靠性">可靠性</a>
</p>

## 项目能力

`splatoon3-bot` 将一次校验通过的 [Splatoon 3](https://splatoon3.ink/) 数据快照渲染为可复现截图，通过通用 S3 协议发布原图与通知图，再并行发送到所有已配置的目标。

<table>
  <tr>
    <td width="33%" align="center"><strong>确定性截图</strong><br><sub>固定数据、时间、语言、视口、字体、图片就绪条件、尺寸与视觉基线。</sub></td>
    <td width="33%" align="center"><strong>通用对象存储</strong><br><sub>支持 AWS S3、Cloudflare R2、MinIO、又拍云 S3 等 SigV4 兼容服务。</sub></td>
    <td width="33%" align="center"><strong>平台原生消息</strong><br><sub>模板卡片、Embed、Flex Message、Block Kit 与媒体模板，而不是粗糙纯文本。</sub></td>
  </tr>
  <tr>
    <td width="33%" align="center"><strong>并行且部分成功</strong><br><sub>平台与目标并行执行，单个目标内仍保持通知顺序。</sub></td>
    <td width="33%" align="center"><strong>Manifest 完整性</strong><br><sub>尺寸、哈希、URL、渲染参数与数据身份贯穿整个链路。</sub></td>
    <td width="33%" align="center"><strong>CI 优先</strong><br><sub>固定版本 Actions、严格 YAML、Environment、审计与本地 Linux 验证。</sub></td>
  </tr>
</table>

当前内置 **企业微信、Discord、Telegram、QQ、飞书、钉钉、WhatsApp、LINE、Slack** 九个适配器。平台能力与消息设计依据见 [通知平台能力审计](./docs/notification-platform-capabilities.md)。

## 截图预览

### 直接查看全部四张确定性截图

<table>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/schedules.zh-CN.png" alt="中文对战日程截图"><br><sub><code>schedules.zh-CN.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/salmon-run.zh-CN.png" alt="中文鲑鱼跑截图"><br><sub><code>salmon-run.zh-CN.png</code></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-dailydrop.zh-CN.png" alt="中文鱿鱼须商城今日精选截图"><br><sub><code>gear-dailydrop.zh-CN.png</code></sub></td>
    <td align="center"><img src="./tests/golden/screenshots/linux-x64/gear-regular.zh-CN.png" alt="中文鱿鱼须商城在售装备截图"><br><sub><code>gear-regular.zh-CN.png</code></sub></td>
  </tr>
</table>

逻辑视口始终为 `1200×675`。`BOT_SCREENSHOT_RESOLUTION` 选择精确的 16:9 原图尺寸，发布阶段同时生成跨平台友好的 `1024×576` 通知图。

## 快速开始

### Fork 到你自己的私有仓库并运行

每位使用者都应在自己的 GitHub 账号下维护一份私有安装。该仓库是部署与信任边界：代码、定时任务、Repository Secrets、Repository Variables、Environment 规则和消息目标都由你独立管理。

<p align="center">
  <a href="https://github.com/TenviLi/splatoon3-bot/fork"><strong>Fork 或创建你的私有安装 →</strong></a>
</p>

> [!TIP]
> 托管运行只需要 GitHub Actions、一个兼容 S3 的 Bucket 和一个消息目标；不需要自行部署服务器，也不需要安装 Node.js、pnpm、Chrome 或 Docker。

1. 在自己的 GitHub 账号下创建安装仓库。源仓库与组织策略允许私有 Fork 时直接使用 **Fork**；由于 [公开仓库的 Fork 必然公开](https://docs.github.com/zh/pull-requests/collaborating-with-pull-requests/working-with-forks/about-permissions-and-visibility-of-forks#about-visibility-of-forks)，无法私有 Fork 时请使用 [GitHub Importer](https://github.com/new/import) 或独立私有镜像。
2. 根据 [`S3_CONFIG` 示例](#s3_config)创建同名 Repository Secret。
3. 中文快速开始默认使用企业微信。在群机器人设置中取得 Webhook，创建 Repository Secret `BOT_WECOM_CONFIG`：

   ```yaml
   - name: 对战日程群
     notifications: [schedules]
     webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
   - name: 打工和装备群
     notifications: [salmon-run, gear-dailydrop, gear-regular]
     webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
   ```

   参考企业微信官方的[群机器人说明](https://developer.work.weixin.qq.com/document/path/91770)，或从[通知平台](#通知平台)中选择其他适配器。
4. 默认值不合适时，再创建 `BOT_LOCALE`、`BOT_SCREENSHOT_RESOLUTION` 等 [Repository Variables](#repository-variables)。
5. 打开 <kbd>Actions</kbd>，按 GitHub 提示启用工作流，然后用 `all` Profile 运行 **Check Bot Configuration**。它只校验配置，不上传图片、不发送消息。
6. 对已配置的平台运行 **Notification Channel smoke test**。该步骤会真实发布并发送一条消息，用于在开启定时任务前确认 S3 公网访问和目标权限。

> [!IMPORTANT]
> 生产凭据只能保存在你的私有安装仓库中，不要提交到代码、Pull Request 或日志。Secrets 与 Variables 都是每份安装独立配置的。

> [!CAUTION]
> 默认分支上的工作流可以读取凭据。同步上游改动前，重点审查 `.github/workflows/`、`bot/` 与 `scripts/`；凭据一旦被提交，应立即轮换或撤销。

## 自动化

<p align="center">
  <strong>数据快照</strong> → <strong>构建</strong> → <strong>截图</strong> → <strong>配置预检</strong> → <strong>S3</strong> → <strong>平台适配器</strong>
</p>

定时与手动入口共用同一个两阶段工作流：

1. **Prepare** 下载并校验一份完整数据快照，构建前端，生成所选截图并归档整个 Bot Run。
2. **Publish and notify** 只下载一次归档，在副作用前集中校验配置，上传截图和内置图标，再在同一个 Job 中并行发送所有平台与目标。

| 工作流 | 触发方式 | Run Profile |
| --- | --- | --- |
| `bot-schedules.yml` | 其余 UTC 偶数小时 | `schedules` |
| `bot-salmon-run.yml` | UTC `02:00`、`10:00` | `all` |
| `bot-manual.yml` | 手动选择 | 任意 Profile |
| `configuration-check.yml` | 手动选择 | 仅预检，无副作用 |
| `notification-smoke.yml` | 手动选择 Profile 与平台 | 完整真实冒烟测试 |

两条定时入口合计每两小时发送一次日程且不会重复。第三方 Actions 均固定到不可变 Commit SHA；仅支持 GitHub Actions 作为托管自动化平台。

## 配置

在安装仓库的 <kbd>Settings</kbd> → <kbd>Secrets and variables</kbd> → <kbd>Actions</kbd> 中配置以下内容。

### Repository Variables

| Variable | 可选值 / 默认值 | 用途 |
| --- | --- | --- |
| `BOT_LOCALE` | `en-US`、`zh-CN`、`ja-JP`；默认 `zh-CN` | 同时控制截图与通知文案语言。 |
| `BOT_SCREENSHOT_RESOLUTION` | `1200x675`、`1920x1080`、`2400x1350`、`3840x2160`；默认 `2400x1350` | 原始 Screenshot Artifact 的精确尺寸。 |
| `BOT_TIME_ZONE` | IANA 时区；默认 `Asia/Shanghai` | 截图和通知共用的时区。 |
| `BOT_SCREENSHOT_ATTRIBUTION` | 最多 40 字符；默认 `splatoon3.ink` | 截图底栏的中立署名。 |
| `BOT_RUNNER` | 默认 `ubuntu-24.04` | 两个 Bot Run Job 使用的 Runner。 |
| `BOT_ENVIRONMENT` | 默认 `production` | 控制发布权限的 GitHub Environment。 |
| `BOT_CONCURRENCY_GROUP` | 默认 `splatoon3-bot-production` | 串行化生产 Bot Run。 |
| `BOT_ARTIFACT_RETENTION_DAYS` | `1`–`90`；默认 `7` | Bot Run 归档保留天数。 |

| 分辨率 | 缩放 | 适用场景 |
| --- | :---: | --- |
| `1200x675` | 1× | 小体积与视觉测试 |
| `1920x1080` | 1.6× | Full HD 原图 |
| `2400x1350` | 2× | 推荐的清晰度与体积平衡 |
| `3840x2160` | 3.2× | 4K 原图，归档和上传更大 |

对战日程、鲑鱼跑与装备图标由仓库内置资源生成，并按内容哈希自动发布到 S3；用户不需要另行准备公共图标 URL。

### `S3_CONFIG`

创建 Repository Secret `S3_CONFIG`，值为一份严格 YAML Mapping：

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

**必选字段**

| 字段 | 说明 |
| --- | --- |
| `bucket` | 目标 Bucket 名称。 |
| `publicBaseUrl` | 无凭据、可公网访问的 HTTPS Bucket 根地址或 CDN 地址；不要包含 `keyPrefix`。 |
| `accessKeyId` | 拥有上传权限的专用 S3 Access Key；允许对象检查时可避免重复上传内置图标。 |
| `secretAccessKey` | 与 `accessKeyId` 配对的 Secret Key。 |

**可选字段**

| 字段 | 默认值 | 何时填写 |
| --- | --- | --- |
| `region` | `us-east-1` | 使用服务商签名 Region；R2 使用 `auto`。 |
| `endpoint` | AWS SDK 默认值 | R2、MinIO、又拍云 S3 等兼容服务必填。 |
| `forcePathStyle` | `false` | MinIO 与又拍云 S3 通常设为 `true`。 |
| `keyPrefix` | 空 | 为所有对象增加命名空间。 |
| `sessionToken` | 空 | 仅临时凭据需要。 |

`endpoint` 是上传 API，`publicBaseUrl` 是各消息平台实际拉取图片的公网地址。发布器会生成内容寻址的通知图、原图和内置图标，并将尺寸、哈希和 URL 绑定到 Publication Manifest。

| 服务 | 官方配置入口 |
| --- | --- |
| AWS S3 / CloudFront | [创建 Bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html#creating-bucket) · [管理 Access Key](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) · [CloudFront OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) |
| Cloudflare R2 | [快速开始](https://developers.cloudflare.com/r2/get-started/) · [API Token](https://developers.cloudflare.com/r2/api/tokens/) · [公开 Bucket](https://developers.cloudflare.com/r2/buckets/public-buckets/) |
| MinIO / AIStor | [创建 Bucket](https://docs.min.io/aistor/reference/cli/mc-mb/) · [创建 Access Key](https://docs.min.io/aistor/reference/cli/admin/mc-admin-accesskey/mc-admin-accesskey-create/) |
| 又拍云 S3 | [AWS S3 兼容说明](https://help.upyun.com/knowledge-base/aws-s3%E5%85%BC%E5%AE%B9/) · [S3 API](https://help.upyun.com/knowledge-base/s3-api/) |

更多最小权限、公网 URL 和服务商注意事项见 [S3 运维指南](./docs/operator-setup-links.md#s3-compatible-publication)。

> [!TIP]
> 内容寻址对象会有意累积。请为 `notification-images/` 与 `originals/` 配置生命周期策略，并让保留时间与历史消息中的链接有效期一致。

## 通知平台

某个 Channel Secret 存在且非空时，对应适配器自动启用；不需要额外维护平台开关。每个 Secret 必须是直接、非空的 YAML Target 数组。Target 的 `name` 必须唯一；仅在需要限制路由时添加 `notifications`。

| 平台 | 原生消息形式 | Repository Secret | 官方配置 |
| --- | --- | --- | --- |
| 企业微信 | `news_notice` 模板卡片 | `BOT_WECOM_CONFIG` | [群机器人](https://developer.work.weixin.qq.com/document/path/91770) |
| Discord | 图片 Embed | `BOT_DISCORD_CONFIG` | [Incoming Webhook](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) |
| Telegram | 图片、HTML、URL 按钮 | `BOT_TELEGRAM_CONFIG` | [BotFather](https://core.telegram.org/bots/features#botfather) |
| QQ | Embed 或自定义 Markdown | `BOT_QQ_CONFIG` | [QQ 官方机器人](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/getting-started.html) |
| 飞书 / Lark | Card Schema 2.0 | `BOT_FEISHU_CONFIG` | [自定义机器人](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) |
| 钉钉 | ActionCard | `BOT_DINGTALK_CONFIG` | [自定义机器人](https://open.dingtalk.com/document/robots/custom-robot-access) |
| WhatsApp | 已审批媒体模板 | `BOT_WHATSAPP_CONFIG` | [Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) |
| LINE | Flex Message | `BOT_LINE_CONFIG` | [Messaging API](https://developers.line.biz/en/docs/messaging-api/getting-started/) |
| Slack | Block Kit | `BOT_SLACK_CONFIG` | [Incoming Webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) |

[完整平台配置目录](./docs/operator-setup-links.md#notification-adapters)列出了每个平台的必填字段、目标资格、凭据要求和官方文档；[平台能力审计](./docs/notification-platform-capabilities.md)解释了各适配器的原生布局选择。

## 可靠性

- 数据资源并发下载，带重试、超时、Schema 校验与原子替换；无效快照不会覆盖有效数据。
- 截图阶段等待应用、字体和本地图片就绪，并校验语言、署名、尺寸、底栏位置与零溢出。
- Run Manifest v4 记录语言、分辨率、时区、数据快照身份、文件名、尺寸和 SHA-256。
- Publication Manifest v3 将同一 Bot Run 与通知图、原图、内置图标和公网 URL 精确绑定。
- 配置预检会在首次上传前汇总独立错误，且不输出 Secret 内容。
- 平台与目标并行执行，部分成功会被保留，全部适用任务结束后再聚合失败。
- CI 扫描完整 Git 历史，并运行语法、单元、浏览器、视觉、构建、工作流策略与依赖审计。

视觉测试分别维护 Linux 与 macOS 下的中、英、日三套四张截图；像素差异超过 `0.1%` 即失败。

## 本地开发

本节只面向贡献者和高级运维；GitHub 托管运行不需要本地环境。

要求 Node.js 24 LTS，以及 pnpm 11.18 或同一 Major 下更新版本。

```sh
git clone git@github.com:YOUR_GITHUB_USERNAME/splatoon3-bot.git
cd splatoon3-bot
corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run download-data
pnpm run verify
```

| 命令 | 用途 |
| --- | --- |
| `pnpm run bot:doctor <profile> [channel]` | 无副作用校验配置。 |
| `pnpm run bot:prepare <profile>` | 下载、构建、截图并写入 Run Manifest。 |
| `pnpm run bot:publish <profile>` | 校验并通过 S3 发布。 |
| `pnpm run bot:notify <profile> [channel]` | 发送已配置的平台。 |
| `pnpm run test:update-golden` | 生成当前平台的中、英、日截图基线。 |
| `pnpm run verify` | 运行完整本地验证。 |
| `pnpm run verify:actions` | 通过 OrbStack 与 `act` 验证 Linux Actions。 |

## 许可证

本项目以 [GNU General Public License v3.0](./LICENSE) 发布，是非官方同人项目，与 Nintendo 无隶属或背书关系。
