# Public Data Policy

NaviStudy separates application code from learning content.

The public repository may contain synthetic examples that demonstrate the data
shape. It must not contain:

- textbook-derived vocabulary, collocations, or examination questions without
  a clear redistribution license;
- military-theory material extracted from school files or course handouts;
- user learning records, SQLite databases, recovery codes, or sync payloads;
- production exports, screenshots containing personal data, or private WeChat
  project configuration.

Private content is injected locally or during a controlled deployment. A build
must fail closed when a private content package is unavailable rather than
silently publishing an incomplete production dataset.
