# Security Policy

## Supported Version

Security fixes are made on the latest `main` branch. Until tagged releases are published, older revisions are not supported. Private installations created from the template have independent history, so operators must review and apply upstream security fixes themselves.

## Report a Vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/TenviLi/splatoon3-bot/security/advisories/new). Do not include vulnerability details, credentials, webhook URLs, access tokens, recipient identifiers, or private installation logs in a public Issue or Pull Request.

Include the affected commit, impact, minimal reproduction, and any suggested mitigation. Redact every credential and rotate it immediately if exposure is possible.

## Installation Security

- Store `S3_CONFIG` and every `BOT_*_CONFIG` value only as Repository Secrets in the private installation.
- Keep credentials out of Repository Variables, committed files, screenshots, logs, Issues, and Pull Requests.
- Review changes to `.github/workflows/`, `bot/`, and `scripts/` before applying them to a credential-bearing installation.
- Use least-privilege S3 credentials and rotate any secret that may have been disclosed.
