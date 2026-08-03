# Upstream Compatibility

The Vue screenshot layer is derived from [misenhower/splatoon3.ink](https://github.com/misenhower/splatoon3.ink). The last focused compatibility review compared this repository with upstream commit [`83cb6e9`](https://github.com/misenhower/splatoon3.ink/commit/83cb6e9eb18be1b9e330fe1587e9dff36a7ab019) on 2026-08-03.

All fourteen `src/assets/i18n/*.json` application locale files contain the same translation data as that revision. The Bot adds its own complete fourteen-locale `screenshot` and `notification` namespaces separately, so project copy does not overwrite or fork upstream translations.

The complete upstream CJK font set is also retained. Simplified Chinese, Traditional Chinese, Japanese, and Korean therefore use their intended glyph coverage instead of silently falling back to another regional font.

## Adopted Behavior

| Upstream behavior | Local protection |
| --- | --- |
| Upcoming Salmon Run shifts use the short day-and-hour duration format. | `tests/time.test.mjs`, screenshot goldens, and `tests/upstream-regressions.test.mjs` |
| Gear durations fall back to minutes when less than one hour remains. | Three-locale gear screenshot goldens |
| Both current Grizzco Mystery weapon IDs are recognized. | `tests/upstream-regressions.test.mjs` |
| Schedule nodes without mode settings are filtered before rendering. | `tests/upstream-regressions.test.mjs` and screenshot readiness selectors |
| Regular, Anarchy Series, Anarchy Open, and X Battle remain distinct schedule modes. | Run Plan contracts and the `schedules`, `schedules-regular`, `schedules-anarchy`, and `schedules-x` visual goldens |
| Regional Splatfests, multiple Tricolor stages, incomplete results, and missing winners are handled safely. | `tests/content-availability.test.mjs`, `tests/bot-context.test.mjs`, notification goldens, and screenshot goldens |
| Splatfest images load lazily without allowing an incomplete screenshot. | `src/common/screenshotReady.mjs` waits for every image before exposing the ready marker |
| Japanese Splatfest result copy and King Salmonid translation keys use the corrected upstream values. | Locale contracts and three-locale screenshot goldens |
| Russian time units use the upstream custom plural categories. | `tests/i18n-runtime.test.mjs` verifies both the upstream four-form rule and the three-form strings shipped by upstream locale files. |

## Intentional Divergence

- The application does not fetch mutable endpoint data after startup. A Bot Run archives and validates one Data Snapshot, then Vite imports that snapshot for deterministic rendering.
- Screenshot readiness, viewport geometry, attribution, localization, and image completeness are explicit contracts rather than timing assumptions.
- Splatfest selection chooses the nearest active, upcoming, or recent event independently of upstream array ordering.
- Focused schedule screenshots, S3 publication, native notification adapters, Run Plans, and Publication Manifests are project-owned modules and must not be overwritten by an upstream file copy.
- Upstream Vitest coverage is adapted to the repository's Node test runner; Store behavior is loaded through Vite SSR so aliases and snapshot imports exercise the production module graph.

## Review Workflow

1. Pin the upstream commit being reviewed and inspect commits affecting the screenshot route's dependency closure.
2. Compare behavior, not formatting or dependency versions. Copy related files only when their assumptions still match the deterministic Bot Run.
3. Add a failing behavior test before changing a project-owned divergence.
4. Run `pnpm run verify`; run `pnpm run verify:actions` when the change affects Linux rendering or automation.
5. Generate `pnpm run screenshots:contact-sheet -- --locale zh-CN` and review the complete artifact catalog when visual goldens change.
