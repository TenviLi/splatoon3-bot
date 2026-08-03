# Splatoon 3 Bot

The project turns a validated Splatoon data snapshot into screenshot artifacts and platform-specific notifications for configured destinations.

## Language

**Bot Run**:
A complete execution that prepares data, renders screenshot artifacts, publishes them, and delivers notifications.
_Avoid_: Job, pipeline

**Content Group**:
An operator-selectable bundle such as schedules, Salmon Run, or gear. Each group owns a stable set of Screenshot Definitions and Notifications.
_Avoid_: Run Profile, Bot type, message type

**Content Group ID**:
The stable kebab-case value that identifies one Content Group in GitHub Actions, CLI arguments, environment projection, and a Run Selection.
_Avoid_: Profile name, checkbox name

**Run Selection**:
A non-empty, canonical ordering of the Content Group IDs chosen for one Bot Run.
_Avoid_: Profile, checkbox state

**Run Plan**:
The resolved, ordered Screenshot Definitions and Notifications produced from one Run Selection.
_Avoid_: Matrix, Job list

**Data Snapshot**:
One validated, immutable generation of all Splatoon data required by a Bot Run.
_Avoid_: Data files, downloaded JSON

**Screenshot Definition**:
The route, viewport, output name, and rendering contract for one Screenshot ID.
_Avoid_: Screenshot type, page config

**Screenshot ID**:
The stable kebab-case identity shared by one Screenshot Definition, its PNG basename, and its matching Notification. A Content Group may expand to one or more Screenshot IDs.
_Avoid_: Content Group, locale filename, route name

**Screenshot Artifact**:
A rendered PNG produced from a Screenshot Definition, Data Snapshot, fixed render time, time zone, and screenshot attribution.
_Avoid_: Screenshot file, image output

**Screenshot Attribution**:
Short, non-sensitive, platform-neutral text displayed beside the title in every Screenshot Artifact footer.
_Avoid_: WeCom account, author icon

**Publication Manifest**:
A credential-free record that binds one Bot Run and its Data Snapshot Manifest to immutable published image variants, public URLs, dimensions, byte counts, SHA-256 digests, branding, render time, time zone, and screenshot attribution.
_Avoid_: Upload result, URL map

**Notification**:
A platform-neutral message describing current Splatoon information and its Screenshot Artifact.
_Avoid_: Card payload, webhook body

**Notification Channel**:
A delivery medium such as WeCom, Discord, Telegram, QQ, Feishu, DingTalk, WhatsApp, LINE, or Slack.
_Avoid_: Platform client, webhook type

**Notification Target**:
One configured destination within a Notification Channel. A Channel can contain multiple Targets, and each Target may select which Notifications it receives.
_Avoid_: Webhook URL, chat config

**Configuration Preflight**:
A side-effect-free validation of the Run Selection, public project options, publication credentials, and every configured Notification Channel before publication begins.
_Avoid_: Dry run, config check

**Delivery Result**:
The success or failure of delivering one Notification to one Notification Target.
_Avoid_: Fetch response, webhook result
