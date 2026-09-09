---
name: NaviStudy
description: A calm academic continuation desk for Navi learning products.
colors:
  cobalt-navigation: "#174ea6"
  cobalt-deep: "#103872"
  paper-white: "#f5f3ed"
  surface-white: "#fffefa"
  ink: "#17202b"
  secondary-ink: "#68717a"
  hairline: "#d5d3cb"
  words-mint: "#d8f0df"
  words-ink: "#125b3c"
  mt-saffron: "#f7df9a"
  mt-ink: "#674a00"
  oj-gray: "#e6e9ee"
  focus-orange: "#d14d18"
typography:
  display:
    fontFamily: "Songti SC, Noto Serif SC, Georgia, serif"
    fontSize: "60px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "0"
  body:
    fontFamily: "Inter, Noto Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0"
  label:
    fontFamily: "Inter, Noto Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0"
rounded:
  control: "6px"
  surface: "8px"
  round: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt-navigation}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "0 15px"
  input:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "10px 12px"
  passport-panel:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
---

# Design System: NaviStudy

## Overview

**Creative North Star: "The Academic Continuation Desk"**

NaviStudy feels like a quiet, well-kept study desk: paper-toned ground, strong ink typography, precise rules, and clearly separated subject bands. The interface is operational rather than promotional. It gives continuation, product choice, and account state a visible order without turning each action into a floating card.

Color identifies product boundaries while cobalt identifies shared Passport actions. On narrow screens the desktop composition unfolds into one continuous vertical workspace, preserving the same reading order and full-width subject bands.

**Key Characteristics:**
- Paper and ink provide the neutral working surface.
- Mint, saffron, and cool gray identify Words, MT, and OJ without blending their identities.
- Cobalt is reserved for shared identity, focus, and primary actions.
- Dividers and tonal fields carry most structure; shadow is used sparingly.

## Colors

The palette combines academic neutrals with three product-specific fields and one shared navigation accent.

### Primary
- **Cobalt Navigation**: Shared Passport identity, primary buttons, active tabs, and authenticated state.
- **Cobalt Deep**: Active continuation surface where white text needs a stable dark field.

### Secondary
- **Words Mint / Words Ink**: NaviWords band and its foreground.
- **MT Saffron / MT Ink**: NaviMT band and its foreground.
- **OJ Gray**: NaviOJ's deliberately neutral, independent-account band.

### Neutral
- **Paper White**: Page ground and input fill.
- **Surface White**: Elevated account and dialog surfaces.
- **Ink**: Primary copy, controls, and structural dark surfaces.
- **Secondary Ink**: Supporting copy and status text.
- **Hairline**: Dividers and restrained control borders.

**The Product Field Rule.** Product colors fill the complete row; they are not reduced to decorative badges or accent strips.

## Typography

**Display Font:** Songti SC with Noto Serif SC and Georgia fallbacks  
**Body Font:** Inter with Noto Sans SC, Microsoft YaHei, and system fallbacks

**Character:** A Chinese serif question gives the desk a literary, academic voice; compact sans-serif controls keep repeated work clear and contemporary.

### Hierarchy
- **Display** (700, 60px desktop / 44px tablet / 36px mobile, 1.08): The single opening question.
- **Title** (700-900, 18-22px): Product and Passport names.
- **Body** (400, 16px, 1.7): Explanations and account guidance, generally held below 65 characters per line.
- **Label** (700, 12-13px): Fields, statuses, and compact actions.

**The One Display Voice Rule.** Serif display type appears only in the opening question; operational surfaces remain sans-serif.

## Layout

The desktop workspace uses a 1180px maximum container with a 7:5 study-to-account grid. The Passport panel remains sticky while product actions scroll. At 860px the layout becomes one column; at 560px the product fields and Passport surface run edge to edge while headings and continuation retain a 16-20px inset. Core controls keep stable heights and grid tracks so state changes do not shift the interface.

## Elevation & Depth

Depth is structural and rare. Product rows stay flat and are separated by hairlines. The continuation band and desktop Passport panel use one ambient shadow (`0 14px 34px rgba(27, 35, 45, .09)`); dialogs use a stronger interruption shadow. Dark mode deepens surfaces instead of adding glow.

**The Flat Product Rule.** Subject destinations are tonal bands, never separate floating cards.

## Shapes

Surfaces use compact 8px corners and controls use 5-6px corners. Circles are reserved for icons, product marks, avatars, and small icon-only actions. Pills are limited to status badges such as "独立账号".

## Components

### Buttons
- **Shape:** Compact corners (6px) for commands; circles for icon-only utilities.
- **Primary:** Cobalt field, white label, 46px minimum height, and balanced 15px horizontal inset.
- **Hover / Focus:** Slight tonal darkening on hover and a 3px orange focus ring with offset.

### Cards / Containers
- **Corner Style:** Compact 8px corners on desktop; the mobile Passport panel becomes edge-to-edge.
- **Background:** Surface white in light mode and a deep neutral surface in dark mode.
- **Shadow Strategy:** Ambient shadow only for continuation, Passport, and dialogs.
- **Internal Padding:** 20-30px depending on hierarchy.

### Inputs / Fields
- **Style:** Paper fill, 1px hairline border, 6px corners, and 46px minimum height.
- **Focus:** Border moves to cobalt with a translucent 3px cobalt outline.
- **Error / Disabled:** Error uses a low-intensity danger field; disabled controls reduce opacity and preserve labels.

### Navigation
- The masthead is a sticky hairline-separated bar. Mobile hides redundant text while preserving labeled icon buttons through accessible names and tooltips.

### Product Rows
- Each product is one full-width tonal row with a stable mark, name, description, and directional action. OJ carries an explicit independent-account badge on wider screens.

## Do's and Don'ts

### Do:
- **Do** use full-width tonal rows to distinguish learning products.
- **Do** keep Passport actions cobalt and product actions in their product foreground color.
- **Do** preserve explicit sync language: 仅本机、正在同步、已同步、等待网络、需要处理.
- **Do** keep the 320px layout free of horizontal scrolling and retain 44px-class touch targets.

### Don't:
- **Don't** place product cards inside a larger card.
- **Don't** use product colors for unrelated account or security actions.
- **Don't** rely on color alone for sync, deletion, or authentication status.
- **Don't** turn NaviOJ into a Passport-connected product or omit its independent-account label.
