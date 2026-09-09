# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React and Vite, delivered as a static client-side application. Study state remains available in browser storage; optional username-based synchronization is provided by a small same-origin PHP endpoint.

## Users

The primary users are students reviewing university Military Theory coursework, especially before a closed-book examination. They need to turn a mixed archive of old question banks and newer review notes into short, repeatable practice sessions on desktop and mobile.

## Product Purpose

The site provides searchable questions, configurable practice, answer checking, favorites, a wrong-answer book, and local progress. Success means a student can begin practicing within seconds, understand which material is current versus historical, and resume without creating an account.

## Positioning

Unlike a generic quiz shell, every question remains traceable to the supplied local documents. Modern 2023-2025 review materials define the current study baseline; older banks remain available as historical practice rather than being presented as unquestioned authority.

## Operating Context

- Short practice between classes and focused exam review sessions.
- Desktop use favors a visible question navigator and study context.
- Mobile use favors one-question focus, reachable bottom navigation, and resumable progress.
- Source documents include PDF, DOCX, and legacy DOC files under the parent Military Theory archive.

## Capabilities and Constraints

- Practice modes: sequential, random, wrong answers, and favorites.
- Question types: single choice, multiple choice, true/false, and short answer self-assessment.
- Search and filter by chapter, type, source period, and state.
- Browser-local favorites, answers, accuracy, and recent sessions.
- Optional NaviStudy passport sync for Military Theory data only; NaviWords uses a separate endpoint and data file.
- Conflicting answers are excluded from default scored practice and visibly marked for review.
- The public build is deployed at `https://mt.dxir.net.cn`; server changes must follow the documented backup, staging, validation, and rollback process.
- Source wording may be dated. The site must state that current course materials and teacher guidance take precedence.

## Brand Commitments

The user supplied `bhhg.buaaer.top` as the interaction reference. Preserve its efficient dashboard, persistent navigation, question palette, and focused practice flow, while creating a distinct Military Theory identity and fully responsive mobile behavior.

## Evidence on Hand

- 19 local source files in `D:\事务\服务器\军事理论`, including 11 PDFs, 4 DOCX files, and 4 DOC files.
- Modern review baseline: 2023, 2024, and 2025 course summaries plus locally compiled review and answer sheets.
- Historical practice banks contain hundreds of multiple-choice, true/false, and short-answer prompts.
- Nine screenshots supplied by the user document the reference site's dashboard, practice, library, wrong-answer, favorites, comments, ranking, bank switcher, and account modal.

## Product Principles

- Begin practice before configuration becomes work.
- Make progress visible but never gamify uncertain source material.
- Keep source provenance one action away from every answer.
- Treat mobile as a first-class study environment.
- Distinguish current review guidance from historical questions at all times.

## Accessibility & Inclusion

Keyboard navigation, visible focus, semantic controls, reduced-motion support, adequate contrast in both themes, and layouts that remain usable from 320px upward.
