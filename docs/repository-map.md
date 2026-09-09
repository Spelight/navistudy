# Repository Map

The repository is intentionally organized as one public monorepo. The unified
WeChat launcher copies the Words and MT modules from `packages/` during a local
sync step. This keeps module source in one place and avoids three divergent
copies of the same client.

Passport identity is shared between Words and MT, while learning data remains
isolated by product, schema, and authorization scope. NaviOJ is outside this
boundary.

Deployment files are not part of the public source tree. Production paths,
server addresses, and credentials belong in private infrastructure management.
