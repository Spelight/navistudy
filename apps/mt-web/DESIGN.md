# Design System

## Direction

The interface is a modern field briefing desk: measured, information-dense, and calm. It borrows the reference site's fast operational layout but replaces its pure-black gaming shell with warm paper, deep ink, signal teal, and restrained vermilion. The first viewport is the working dashboard itself.

## Layout

- Desktop: 240px navigation rail, compact command bar, fluid working canvas.
- Practice desktop: question index, focused question surface, and contextual answer/source rail.
- Mobile: compact header, single-column content, sticky bottom navigation, and a sheet-based question index.
- Main content width remains fluid; fixed-format controls use stable dimensions to prevent layout shift.

## Color

- Light ground: warm off-white with cool gray-green panels.
- Dark ground: neutral charcoal rather than blue-black.
- Primary action and correct state: signal teal.
- Incorrect and warning state: vermilion.
- Progress and focus: cobalt.
- Borders remain quiet and structural; cards do not nest inside cards.

## Typography

- Interface: system sans-serif with Chinese platform fallbacks.
- Display labels use the same family at stronger weight; no decorative display font.
- Letter spacing is always zero.
- Question text is larger than controls but never hero-scaled.

## Components

- Buttons pair familiar Lucide icons with concise labels where the command benefits from text.
- Segmented controls select practice scope; switches control binary settings.
- Answer choices are full-width stable rows with letter markers and explicit selected/correct/incorrect states.
- Progress appears as a linear rail and numeric fraction, not ornamental charts alone.
- Corners stay between 4px and 8px.

## Motion

One restrained page transition and state-color transition. All motion is disabled under `prefers-reduced-motion`.

## Voice

Direct, exam-oriented, and cautious about source age. Avoid competitive ranking, invented community activity, and unsupported authority claims.
