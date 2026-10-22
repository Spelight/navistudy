# NaviStudy

[简体中文](README.md) | **English**

**A learning platform connecting vocabulary practice, quizzes, close reading, and academic planning.**

Built around real coursework and exam preparation needs, NaviStudy provides Web and WeChat Mini Program clients. Users can practice and save progress locally, then sign in with NaviPassport to synchronize learning data separately for each product.

[Live platform](https://study.dxir.net.cn/) · [Architecture](docs/architecture.md) · [Local development](docs/getting-started.md) · [Public release scope](docs/data-policy.md)

## Products and Source Code

| Module | Capabilities | Source |
| --- | --- | --- |
| NaviWords | Textbook and unit selection, flashcards, multiple-choice and spelling exercises, favorites, mistake review, and progress restoration | `apps/words-web`, `packages/words-mini` |
| NaviMT | Categorized question bank, previously attempted question filtering, mistake review, and practice state | `apps/mt-web`, `packages/mt-mini` |
| NaviReading | Parallel English and Chinese text, vocabulary hints, bookmarks, annotations, and reading position | `apps/reading-web`, `packages/reading-mini` |
| NaviPlan | Degree requirements, credit requirement trees, course corrections, and course recommendations | `apps/plan` |
| NaviTools | Availability polls, sharing, responses, and aggregated results | `apps/tools` |
| NaviPassport | Accounts, device sessions, authorization, data synchronization, administration, and usage analytics | `apps/study-platform` |
| WeChat client | Main-package navigation and separate product subpackages | `apps/wechat` |

## Implementation Highlights

- **Shared identity, isolated data:** Products use separate scopes and synchronization documents, with server-side product permission checks.
- **Resumable learning:** Local storage preserves practice position, mistakes, and favorites so users can continue after navigating away.
- **Authorization Code + PKCE:** Web products establish separate sessions with token refresh, device management, and revocation.
- **Shared Mini Program modules:** Source modules live in `packages/` or their product directories; scripts generate the unified client's subpackages.
- **Explainable degree audits:** Degree requirements, course pools, and personal corrections are modeled separately. Recommendations address specific requirement gaps.
- **Original demo content:** A small vocabulary dataset, four question types, and five short reading units demonstrate the data structures and practice logic.

## Technology Stack

JavaScript / TypeScript · React · Vite · PHP 8.2 · SQLite · Kotlin / Ktor · Native WeChat Mini Programs.

## Quick Start

Requires Node.js 22+. The basic checks do not require installing dependencies:

```sh
npm test
```

Run the quiz demo:

```sh
npm --prefix apps/mt-web ci
npm --prefix apps/mt-web run dev
```

Run the vocabulary demo (requires PHP):

```sh
php -S 127.0.0.1:8788 -t apps/words-web
```

Open `http://127.0.0.1:8788/`. Vocabulary practice works locally; cloud synchronization requires a separately configured Passport backend.

Import `apps/wechat` into WeChat DevTools. A test AppID is configured by default. See the [local development guide](docs/getting-started.md) for full requirements and limitations.

## About This Public Release

This repository is a source-code showcase of the production platform, with an independent public commit history. Textbook content, scanned pages, course question banks, production configuration, user data, and internal operational records are excluded. The demo does not connect to production services; default endpoints use `example.test`.

Specialized exam question pools and textbook page comparisons require your own authorized content, which is not included in the public samples. NaviPlan's academic data import requires an account at the supported institution and access to its upstream services.

## License

First-party application code is licensed under [MIT](LICENSE). Third-party code retains its original licenses; see [third-party notices](docs/third-party.md). Course materials are not distributed under the code license.

