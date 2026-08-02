# Contributing

Thanks for improving `splatoon3-bot`. Template users should create a private installation; contributors should fork this public source repository and open a Pull Request against `main`.

## Before You Start

- Use an Issue for reproducible bugs or a focused feature proposal.
- Report security concerns privately according to [SECURITY.md](./SECURITY.md).
- Never commit credentials, webhook URLs, recipient identifiers, private installation data, or production logs.
- Keep changes focused and preserve deterministic screenshots, notifications, Run Plans, and Manifests.

## Local Setup

Requirements: Node.js 24 LTS and pnpm 11.18 or newer within major version 11.

```sh
git clone https://github.com/YOUR_GITHUB_USERNAME/splatoon3-bot.git
cd splatoon3-bot
git remote add upstream https://github.com/TenviLi/splatoon3-bot.git
corepack enable
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run download-data
```

## Validation

Run the narrowest relevant test while iterating, then finish with:

```sh
pnpm run verify
```

Run `pnpm run verify:actions` when changing GitHub Actions, Linux browser behavior, secret scanning, or the local Actions verifier. Review every changed screenshot or notification golden deliberately; do not regenerate goldens merely to hide a regression.

## Pull Requests

- Explain the user-visible behavior and why the chosen design fits the existing module boundaries.
- Add or update contract tests for every behavior change.
- Update all three README languages when operator-facing behavior changes.
- Keep commits reviewable and use concise imperative commit messages.
- Confirm that logs and diffs contain no credentials or private installation data.
