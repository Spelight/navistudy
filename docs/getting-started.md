# Local development

Use Node.js 22+. Run `npm test` for public-source validation and selected state/authentication regressions. `npm run demo:data` regenerates the original examples; `npm run sync:wechat` regenerates the product subpackages. Edit generated subpackages through their upstream modules.

## Web clients

- MT: `npm --prefix apps/mt-web ci` then `npm --prefix apps/mt-web run dev`.
- Words: `php -S 127.0.0.1:8788 -t apps/words-web`.
- Reading: `php -S 127.0.0.1:8789 -t apps/reading-web`, then open `/study-notes.html`.
- Plan: `npm --prefix apps/plan/frontend ci` then `npm --prefix apps/plan/frontend run dev`. Complete import requires Ktor and Passport.

The demo fixtures exercise local learning. Textbook scans, course-specific exam pools and reference documents are omitted. Some labels still describe the original course organization.

## Passport

Requires PHP 8.2+, PDO SQLite and mbstring. From `apps/study-platform`, copy `.env.example` to `.env`, run `php scripts/migrate.php`, then `php -S 127.0.0.1:8787 public/router.php`. PHP integration tests: `php tests/run.php`.

Create your owner account locally, then set `NAVISTUDY_ADMIN_USERNAME` to its username. Until configured, all accounts are denied administrative access. Configure your own analytics secret, origins and callback allowlists. Product proxy routes need your own reverse proxy; the PHP development server alone does not emulate the complete production topology.

## WeChat

Import `apps/wechat` in WeChat DevTools. Replace `touristappid` with your own AppID for account-backed capabilities. Configure your own request/download domains and endpoints. Local practice uses sample data; network features require a configured backend.

## Kotlin backend

NaviPlan requires JDK 21 and Gradle. Run `gradle -p apps/plan/backend test` to validate parsing and audit logic. Inspect environment variables in `Application.kt` and `PassportVerifier.kt` before starting it. No school credentials or live student records are provided.
