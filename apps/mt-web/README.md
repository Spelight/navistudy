# NaviMT

NaviMT is the military-theory practice client in NaviStudy.

This public copy includes the application shell, question handling logic,
source-processing tools, and a synthetic fixture. The production question bank
and the course files used to generate it are intentionally excluded because
their redistribution rights have not been established.

## Development

```powershell
pnpm install
pnpm run dev
```

The public fixture is under `src/data/question-bank.json`. A deployment build
must inject a separately licensed content package before publishing.
