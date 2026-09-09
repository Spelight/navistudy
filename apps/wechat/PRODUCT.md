# Product

## Platform

adaptive

Native WeChat Mini Program with one launcher package and two independent feature subpackages.

## Purpose

NaviStudy is a compact study launcher. Students enter one mini program, then choose NaviWords for English vocabulary study or NaviMT for Military Theory practice.

## Product Rules

- NaviWords and NaviMT retain independent pages, learning logic, local storage, and data sources.
- The launcher owns only module discovery, recent-module continuation, and switching between modules.
- Updating one module must not require hand-editing the other module.
- NaviWords and NaviMT share one passport username while keeping separate local storage keys, remote APIs, and data files.
- Both modules support optional cross-platform sync; every sync action is scoped to the current module.
- The current passport is a username-based convenience protocol, not authenticated identity.

## Primary Flow

1. Open NaviStudy.
2. Choose NaviWords or NaviMT.
3. Study entirely inside that module.
4. Return to NaviStudy from the module navigation when switching subjects.
