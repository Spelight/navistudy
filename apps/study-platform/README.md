# NaviStudy Platform

Unified NaviStudy hub, password Passport API, and revisioned synchronization service for NaviWords and NaviMT.

## Local development

Requirements: PHP 8.2 with PDO SQLite, Node.js 20+ for frontend tooling and contract tests.

```powershell
Copy-Item .env.example .env
php scripts/migrate.php
php -S 127.0.0.1:8787 public/router.php
```

Open `http://127.0.0.1:8787/`. The local data directory defaults to `var/` and is ignored by Git.

```powershell
php tests/run.php
npm test
```

## Production layout

- Application: `/var/www/navistudy-platform`
- Public root: `/var/www/navistudy-platform/public`
- Private databases: `/var/lib/navistudy/*.sqlite3`
- Backups: `/var/backups/navistudy/`

The API can be mounted at `/navistudy-api/` on the Words and MT hosts. Product cookies are host-only; the SSO cookie is only issued by `study.dxir.net.cn`.

