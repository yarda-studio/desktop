---
name: Yarda Brand Design System
colors:
  brand:
    forest: '#1D400B'
    olive: '#628937'
    sage: '#88AB81'
    ink: '#0B171B'
    bone: '#FDFDFD'
    live: '#BF3640'
  dark:
    background: '#0B171B'
    surface: '#101C20'
    surface-dim: '#0B171B'
    surface-container-low: '#0E1A1E'
    surface-container: '#152125'
    surface-container-high: '#1D292D'
    surface-container-highest: '#263236'
    on-surface: '#FDFDFD'
    on-surface-variant: '#909597'
    outline: 'rgba(253, 253, 253, 0.08)'
    outline-variant: 'rgba(253, 253, 253, 0.16)'
    primary: '#88AB81'
    on-primary: '#0B171B'
    primary-container: '#1D400B'
    on-primary-container: '#FDFDFD'
    secondary: '#88AB81'
    tertiary: '#628937'
    error: '#BF3640'
  light:
    background: '#F8F9F5'
    surface: '#FDFDFB'
    surface-dim: '#F4F6F0'
    surface-container: '#F3F5EF'
    surface-container-high: '#ECEFE7'
    on-surface: '#0E1A0F'
    on-surface-variant: '#4E5E4D'
    outline: '#859A80'
    outline-variant: '#E3E8DD'
    primary: '#3E5724'
    on-primary: '#FDFDFB'
    primary-container: '#E0EBDE'
    on-primary-container: '#1D400B'
    secondary: '#4E5E4D'
    tertiary: '#628937'
    error: '#BF3640'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  display-md:
    fontFamily: Source Serif 4
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
  scripture-reading:
    fontFamily: Source Serif 4
    fontSize: 19px
    fontWeight: '400'
    lineHeight: 32px
  scripture-reading-mobile:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
  scripture-poetry:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 32px
  ui-header:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  ui-body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  ui-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  ui-subtext:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  metadata-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  verse-superscript:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 11px
rounded:
  sm: 0.25rem
  DEFAULT: 0.375rem
  md: 0.5rem
  lg: 0.5rem
  xl: 0.75rem
  2xl: 1rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The brand personality centers on quiet contemplation, monastic clarity, and technical speed. Designed for desktop environments (scholarship chambers, sanctuary presentation booths, focused personal reflection), the interface recedes entirely to let the text command presence.

The aesthetic fuses **Editorial Minimalism** with **Selective Glassmorphism**:
- **80% Solid Grounding:** Deep, untextured, opaque canvas layers maximize legibility and reading stamina during prolonged study sessions.
- **20% Frosted Floating Chrome:** Modals, navigation sidebars, and control bars float above the textual plane using a 24px backdrop blur, 150% saturation, and razor-sharp hairline borders.
- **Atmospheric Context:** Floating chrome rests above extremely soft radial ambient blooms (forest, olive, sage) that register only peripherally, preventing sterile digital fatigue without interrupting typographic focus. Scripture itself is always on a solid surface, never on a bloom.

## Colors
The system defaults to dark mode for auditorium projection and late-night study, backed by a matching high-contrast daylight mode. The front-matter tokens are the source of truth; the values below summarize how they are used.

### Dark Mode (Default)
- **Canvas:** Ink `#0B171B`. Raised layers step toward white: surface `#101C20`, container `#152125`, container-high `#1D292D`, container-highest `#263236`.
- **Ink Primary:** Bone `#FDFDFD`. **Ink Muted:** `#909597`.
- **Hairlines:** `rgba(253, 253, 253, 0.08)`; stronger variant `0.16`.
- **Primary:** Sage `#88AB81` with ink `#0B171B` on top. **Primary container:** Forest `#1D400B` with bone text.
- **Glass:** `rgba(11, 23, 27, 0.72)` with border `rgba(253, 253, 253, 0.10)`.

### Light Mode
- **Canvas:** Bone `#F8F9F5`. **Surface:** `#FDFDFB`.
- **Ink Primary:** `#0E1A0F`. **Ink Muted:** `#4E5E4D`.
- **Hairlines:** `#E3E8DD`; control outlines `#859A80`.
- **Primary:** Olive `#3E5724` (AAA on bone) with `#FDFDFB` on top. **Primary container:** `#E0EBDE` with forest `#1D400B` text.
- **Glass:** `rgba(253, 253, 251, 0.82)` with border `rgba(255, 255, 255, 0.80)`.

### Accents & Semantics
- **Brand:** Forest `#1D400B`, Olive `#628937` (tertiary), Sage `#88AB81`. Focus rings, carets, and active passage states use the primary color.
- **Exegesis & Tags (Strong's Concordance, Bookmarks):** Warm gold, `#B8892B` (`#C89A3C` in dark UI text, `#8A620E` in light for AA contrast).
- **Live Broadcast, Blackout, Destructive:** Crimson `#BF3640` (`live`/`error`).
- **Verified Status (Installed Modules, Synced):** Soft jade, via the tertiary jade tokens.
- Other accent presets (indigo, blue, teal, green, gold, orange, rose) are user-selectable alternatives; the Yarda green accent is the default and the reference.

## Typography
Typographic hierarchy is bifurcated between literary exegesis and instrument-grade utility.

- **The Scripture Reader:** Rendered in `Source Serif 4`. The text column never exceeds 680px (about 65-72 characters per line). Size is 19px desktop / 17px mobile with a 1.7 line height; user preferences may scale size and leading.
- **Verse Indicators:** `Inter` semi-bold 11px superscript. Verse numbers sit in secondary muted ink, switching to the primary accent on selection or hover, and to gold on a commentary bookmark.
- **Metadata, Lexicon & Concordance:** `JetBrains Mono` 11px with `0.05em` letter-spacing for Strong's numbers (`H7225`, `G3056`), translation IDs, and verse tokens. Tags and badges set it uppercase; reference labels such as `John 3:16` keep their case.

## Layout & Spacing
Designed primarily for Tauri desktop dimensions (1440x900 base):

- **Primary Navigation Rail (Leftmost):** 64px collapsed glass rail that expands on hover or focus to a 200px drawer.
- **Scripture Viewport (Center Stage):** Fluid column containing the centered 680px reading column, with symmetrical padding that absorbs window resizing.
- **Side Panels (Right):** Lexicon, commentary, and other sheets are resizable panes rather than a fixed dock.
- **Rhythm:** An exact 4px/8px modular scale. Component padding uses `space-xs` (4px) to `space-md` (16px).

## Elevation & Depth
Elevation is articulated through translucent optical physics rather than heavy drop shadows.

- **Layer 0 (Window Canvas):** Flat base tint (`#0B171B` / `#F8F9F5`).
- **Layer 1 (Cards & Content Blocks):** Flat elevated surface (`#101C20` / `#FDFDFB`) with a 1px hairline. Zero box-shadow.
- **Layer 2 (Floating Chrome, Command Bars, Floating Verse Actions):** Frosted glass.
  - Backdrop filter: `blur(24px) saturate(150%)`.
  - Fill and border: see Glass under each mode above. Menus and popovers that open over text use the firmer 97-98% fill.
  - Ambient shadow: `0 8px 32px -4px` (black at 0.36-0.40 in dark, forest at 0.08 in light).
- **Under-Glass Ambient Glow:** Radial gradients in forest, olive, and sage operate beneath glass at 8-40% opacity depending on mode, peripheral only.

## Shapes
Small, disciplined corner radiuses reinforce a modern tool aesthetic:

- **Interactive Controls (Buttons, Inputs, Pill Badges):** 6px or 8px (`rounded` / `rounded-md`).
- **Cards, Reference Tiles, Commentary Blocks:** 8px to 12px (`rounded-lg` / `rounded-xl`).
- **Floating Modals, Quick-Switcher HUD, Flyout Drawers:** 12px to 16px (`rounded-xl` / `rounded-2xl`).
- Glass elements mirror the outer container radius minus internal padding for optical nesting.

## Components

### Buttons & Interactive Triggers
- **Primary (`.btn-primary`):** Filled primary accent with its contrast ink, 8px radius, 32px height, `Inter` 14px weight 500, padding `8px 14px`.
- **Glass / Secondary (`.ctl`):** Faint fill, 1px hairline border, brightening on hover.
- **Ghost Action (`.ghost`):** Text/icon only, soft tint on hover.
- **Live (`.btn-live`):** Crimson gradient for Go Live.

### Inputs & Quick-Switcher (HUD)
- **Command Palette (Cmd+K) & Search:** Floating glass panel centered at 600px width, blur 24px, hairline perimeter. Transparent borderless search field with 18px text and mono shortcut badges.
- **Form Inputs (`.field`):** 32px height, 8px radius, tinted fill, hairline outline. Focus adds a 1px primary stroke and a `0 0 0 2px` primary ring at 20%.

### Scripture Verse Interactivity
- **Verse Line:** Selectable text. Hover or focus reveals an action cluster (Copy, Highlight, Present, Lexicon) in a floating glass capsule.
- **Superscript Verse Tag:** Muted by default, primary when active, gold on bookmark.

### Tags & Chips
- **Strong's Concordance Tag (`.tag-strongs`):** Compact pill (`padding: 2px 6px`), radius 4px, `JetBrains Mono` 11px uppercase. Tinted gold background (12%) and gold text.
- **Live Presentation Badge (`.badge-live`):** Pulsing crimson dot, uppercase 10px with `0.08em` tracking, glass backplate.

### Split-Pane & Commentary Cards
- Flat surface backgrounds with hairline separations. Title bars are 36px tall with uppercase mono titles and trailing action icons.
