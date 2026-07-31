# Splatoon 3 Bot

The project turns a validated Splatoon data snapshot into screenshot artifacts and platform-specific notifications for configured destinations.

## Language

**Bot Run**:
A complete execution that prepares data, renders screenshot artifacts, publishes them, and delivers notifications.
_Avoid_: Job, pipeline

**Run Profile**:
A named selection of screenshot artifacts and notifications produced by a Bot Run, such as schedules or gear.
_Avoid_: Bot type, message type

**Data Snapshot**:
One validated, immutable generation of all Splatoon data required by a Bot Run.
_Avoid_: Data files, downloaded JSON

**Screenshot Definition**:
The stable identity, route, viewport, and output name of one screenshot artifact.
_Avoid_: Screenshot type, page config

**Screenshot Artifact**:
A rendered PNG produced from a Screenshot Definition, Data Snapshot, and fixed render time.
_Avoid_: Screenshot file, image output

**Notification**:
A platform-neutral message describing current Splatoon information and its Screenshot Artifact.
_Avoid_: Card payload, webhook body

**Notification Channel**:
A delivery medium such as WeCom, Discord, Telegram, QQ, Feishu, DingTalk, WhatsApp, LINE, or Slack.
_Avoid_: Platform client, webhook type

**Notification Target**:
One configured destination within a Notification Channel. A Channel can contain multiple Targets, and each Target may select which Notifications it receives.
_Avoid_: Webhook URL, chat config

**Delivery Result**:
The success or failure of delivering one Notification to one Notification Target.
_Avoid_: Fetch response, webhook result
