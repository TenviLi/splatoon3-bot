# Splatoon 3 Bot

The project turns a validated Splatoon data snapshot into screenshot artifacts and platform-specific notifications for configured destinations.

## Language

**Bot Run**:
A complete execution that prepares data, renders screenshot artifacts, publishes them, and delivers notifications.
_Avoid_: Job, pipeline

**Run Selection**:
A non-empty, canonical ordering of the Screenshot IDs chosen for one Bot Run.
_Avoid_: Profile, checkbox state

**Run Plan**:
The ordered Screenshot Definitions and Notifications produced from one Run Selection.
_Avoid_: Matrix, Job list

**Data Snapshot**:
One validated, immutable generation of all Splatoon data required by a Bot Run.
_Avoid_: Data files, downloaded JSON

**Last-known-good Data Snapshot**:
The newest previously validated Data Snapshot restored only when a fresh upstream download fails. Its age, fallback status, and original source remain visible, and expired content is still excluded from the effective Run Selection.
_Avoid_: Cache hit, stale data mode

**Screenshot Definition**:
The route, viewport, output name, and rendering contract for one Screenshot ID.
_Avoid_: Screenshot type, page config

**Screenshot ID**:
The stable kebab-case identity shared by one GitHub Actions checkbox, CLI selection value, Screenshot Definition, PNG basename, and matching Notification.
_Avoid_: Bundle alias, locale filename, route name

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

**Notification Channel Adapter**:
The deep module for one Notification Channel. It owns Target validation, asset requirements, image variants, message budgets, individual and Digest presentation, retry/idempotency behavior, delivery, and platform receipt extraction.
_Avoid_: Payload formatter, webhook helper

**Notification Target**:
One configured destination within a Notification Channel. A Channel can contain multiple Targets, and each Target may use Screenshot IDs to limit which items from the Run Selection it receives.
_Avoid_: Webhook URL, chat config

**Digest**:
One Target delivery mode that composes selected periodic Notifications into the Channel's native multi-item presentation. The Adapter splits content into independently ledgered platform-sized deliveries, so a later batch can be retried without repeating an earlier successful batch. A Channel without native Digest support applies its declared individual-delivery fallback.
_Avoid_: Joined text, batch flag

**Configuration Preflight**:
A side-effect-free validation of the Run Selection, public project options, publication credentials, and every configured Notification Channel before publication begins.
_Avoid_: Dry run, config check

**Delivery Result**:
The fulfilled, preserved, or rejected outcome of one Delivery Attempt for one Notification Target. One Digest result may cover multiple Notifications.
_Avoid_: Fetch response, webhook result

**Delivery Attempt**:
One invocation of a Notification Channel Adapter for a stable Delivery ID. Retries increase the attempt count without changing that identity.
_Avoid_: HTTP retry, workflow attempt

**Stable Delivery ID**:
A SHA-256 identity derived from the Channel, Notification Target identity, hashed destination configuration, delivery mode, and either the current Bot Run identity plus periodic Notification content or an Event Alert state identity. A new scheduled Bot Run therefore sends its periodic Notifications even when their content is unchanged, while a failed Job rerun preserves successes from that same Bot Run. Target names deliberately participate as stable operator-owned identities; Event Alert presentation changes do not resend an unchanged domain state. The hash excludes plaintext credentials.
_Avoid_: Request ID, message ID

**Delivery Ledger**:
The private GitHub Actions Cache-backed collection of Delivery Attempt records used to preserve successful deliveries, retry only failed deliveries, and retain platform request or message IDs when available.
_Avoid_: Notification log, run history

**Event Alert**:
A localized, individually delivered Notification derived from a meaningful state transition, such as a Challenge reminder, Big Run, random-weapon rotation, Splatfest phase, or watched gear match. Its stable state identity and the Delivery Ledger prevent repeats while the state is unchanged.
_Avoid_: Scheduled broadcast, push event

**Bot Run Report**:
The credential-free `run-report.json` record that brings Data Snapshot provenance, requested and effective Screenshot IDs, Screenshot Artifacts, published S3 objects, Target routing, Delivery Results, and actionable diagnostics together for one Bot Run. If preparation fails before a validated Data Snapshot exists, the report records that absence explicitly rather than disappearing.
_Avoid_: Step Summary, log file
