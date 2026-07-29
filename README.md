# splatoon3-bot

Splatoon 3 notification bot, heavily based on splatoon3.ink.

## Requirements

- Node.js 24 LTS
- pnpm 11.18
- Google Chrome

## Development

```sh
pnpm install --frozen-lockfile
pnpm run download-data
pnpm run check
```

Generate the same screenshots used by GitHub Actions:

```sh
pnpm run start:schedules
pnpm run start:salmon-run
pnpm run start:gear
```

Set `PUPPETEER_CHANNEL` to use another installed Chrome channel, or set
`PUPPETEER_EXECUTABLE_PATH` to an explicit Chrome executable.

## Automation

Scheduled and manual workflows call a shared workflow that installs the pinned
Node.js and pnpm versions, downloads current data, builds the frontend, captures
screenshots, archives them, uploads them to Upyun, and triggers the configured
webhooks. Dependabot checks npm and GitHub Actions updates weekly.
