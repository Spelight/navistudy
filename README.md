# NaviStudy

NaviStudy is a local-first study platform for two independent products:

- **NaviWords**: vocabulary review and practice.
- **NaviMT**: military theory question practice.
- **NaviOJ**: mentioned as a related product only; it keeps its own account and repository.

This repository contains the reusable application shell, Passport API contracts,
web clients, WeChat mini-program modules, synchronization logic, and tests.

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/study-platform` | NaviStudy hub, Passport API, sync service, and API specifications |
| `apps/words-web` | NaviWords web client shell |
| `apps/mt-web` | NaviMT web client shell |
| `apps/wechat` | Unified NaviStudy WeChat launcher |
| `packages/words-mini` | Words mini-program module source |
| `packages/mt-mini` | MT mini-program module source |
| `docs` | Architecture, security, and data policy |
| `examples` | Small synthetic datasets used for examples and tests |

## Content boundary

The production vocabulary lists, textbook-derived material, military-theory
question bank, user records, deployment configuration, and private WeChat
project settings are deliberately excluded. They are not covered by this
repository's MIT license. The public source uses synthetic examples and accepts
private content packages through a local build step.

## Local checks

The platform contract tests can run with Node.js 20+. The PHP API tests require
PHP 8.2 with PDO SQLite. The web applications use their existing package
manager and build scripts; install dependencies inside the relevant app only.

```powershell
npm --prefix apps/study-platform test
npm --prefix apps/wechat test
npm --prefix apps/mt-web test
```

No production server, database, credentials, or remote deployment is required
for the public repository.

## License

Application source is released under the MIT License. Fonts, icons, third-party
packages, and any private content package retain their own licenses.
