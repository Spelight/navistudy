# NaviStudy

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated from the approved implementation plan: plain HTML/CSS/JavaScript for the hub so it can be served directly by the existing PHP 8.2 deployment without a frontend build runtime.

## Product

NaviStudy is Huang Weixin's unified learning-product entry. It connects NaviWords and NaviMT through one optional Navi Passport while keeping both products useful offline and as a guest. NaviOJ is shown as a related product but keeps its existing QDUOJ account, permissions, and database.

## Users

- Students who need to continue vocabulary or military-theory study across web, WeChat, and Android devices.
- Guest learners who need immediate access without registration.
- Returning learners who need one clear continuation point and trustworthy sync state.

## Product Purpose

Provide one calm starting point for learning, account management, and cross-device continuation across NaviWords and NaviMT.

## Positioning

NaviStudy upgrades local-first study tools with an optional shared identity. The account is a continuity layer, not a gate in front of study.

## Operating Context

Learners move among desktop web, mobile web, a unified WeChat mini program, and the NaviWords Android app. Connectivity can be intermittent, so local work and a durable retry queue remain authoritative until acknowledged by the server.

## Capabilities And Constraints

- Passport identity and synchronization apply only to `words` and `mt`.
- Words and MT data are isolated by database, schema version, scopes, and server-side authorization.
- OJ never receives or accepts a Navi Passport token.
- No email, phone, WeChat OAuth, MFA, or administrator bypass recovery in v1.

## Brand Commitments

Keep the established NaviWords, NaviMT, and NaviOJ names. OJ must always be visibly labeled as using an independent account. Product language is concise Chinese with English product names where already established.

## Evidence On Hand

- Existing NaviWords web and mobile interfaces.
- Existing NaviMT web and mobile interfaces.
- Existing NaviStudy mini-program portal and its real local continuation data.
- No testimonials or public usage statistics are approved; do not invent them.

## Product Principles

- Learning starts before account creation; sign-in upgrades continuity rather than unlocking basic use.
- Sync happens automatically and communicates state in plain language.
- First merge preserves a local snapshot and never silently replaces guest work.
- Security controls should feel calm and comprehensible: devices, recovery code, password, and deletion are explicit account tasks.

## Accessibility And Inclusion

Core tasks must be keyboard accessible, readable without JavaScript where practical, and usable at 320 px through desktop widths. Status cannot rely on color alone.

## Assumptions

This context is inferred from the user's approved implementation plan. The initial hub uses existing NaviWords, NaviMT, and NaviOJ product identity and visual assets; factual product counts are loaded from client data where available rather than invented.
