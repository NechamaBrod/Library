---
name: Warm Hesed Library
colors:
  surface: '#fff8f6'
  surface-dim: '#e1d8d6'
  surface-bright: '#fff8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fbf2f0'
  surface-container: '#f5ecea'
  surface-container-high: '#efe6e4'
  surface-container-highest: '#e9e1df'
  on-surface: '#1e1b1a'
  on-surface-variant: '#594046'
  inverse-surface: '#342f2e'
  inverse-on-surface: '#f8efed'
  outline: '#8d7075'
  outline-variant: '#e0bec4'
  surface-tint: '#b81059'
  primary: '#970046'
  on-primary: '#ffffff'
  primary-container: '#be185d'
  on-primary-container: '#ffd5dd'
  inverse-primary: '#ffb1c3'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#00554e'
  on-tertiary: '#ffffff'
  tertiary-container: '#006f67'
  on-tertiary-container: '#99efe4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9e0'
  primary-fixed-dim: '#ffb1c3'
  on-primary-fixed: '#3f0019'
  on-primary-fixed-variant: '#8f0042'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#9cf2e8'
  tertiary-fixed-dim: '#80d5cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#00504a'
  background: '#fff8f6'
  on-background: '#1e1b1a'
  surface-variant: '#e9e1df'
typography:
  display-lg:
    fontFamily: Rubik
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-md:
    fontFamily: Rubik
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 46px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Rubik
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Rubik
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Rubik
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0em
  title-md:
    fontFamily: Rubik
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Rubik
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: Rubik
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Rubik
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-lg:
    fontFamily: Rubik
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Rubik
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Rubik
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

This design system blends **warm editorial elegance** with **festive communal warmth**. Built specifically for Haredi / Orthodox women running neighborhood home lending libraries (*gemachim* and book collections), it projects modesty, cultural reverence, and domestic warmth without feeling somber or institutional.

### Design Principles & Aesthetic
- **Festive Dignity (*Kavod*):** Vibrant jewel tones (rich berry, celebratory marigold saffron, and deep teal) evoke holiday table linens, velvet bookbindings, and heirloom parchment rather than sterile SaaS utilities.
- **Literary Warmth:** Soft rose-cream canvas surfaces reduce eye fatigue across long administrative shifts, paired with structured borders that recall fine Judaica and illuminated manuscripts.
- **Clarity & Community Focus:** Interfaces favor generous hit targets, legible Hebrew and English typography, clear borrow/return statuses, and friendly lending cards that honor neighborly goodwill.

## Colors

The palette balances uplifting vibrancy with comfortable high contrast suitable for daylight desktop cataloging.

### Palette Roles
- **Primary (`#BE185D` - Rich Velvet Berry):** Used for focal actions (lending checkouts, primary confirmations), active navigation anchors, and header highlights. Evokes joyful celebration and dignified warmth.
- **Secondary (`#D97706` - Warm Saffron Amber):** Used for seasonal notices, category tags, return due date warnings, reservation alerts, and warm celebratory badges.
- **Tertiary (`#0F766E` - Deep Teal Emerald):** Provides grounded balance. Used for collection categories (e.g., *Biographies*, *Hashkafa*, *Youth Fiction*), inventory counts, and success states.
- **Neutral Base (`#292524` - Warm Espresso Stone):** Replaces harsh pure black for primary body copy, crisp card contours, and high-readability data tables.
- **Surface Canvas:** Tinted rose-cream background (`#FFFDF9` to `#FDF8F3`) creates a comforting domestic atmosphere and eliminates harsh glare.

## Typography

The typographic hierarchy relies on **Rubik** for both Hebrew and Latin character sets. Its slightly rounded terminals and geometric proportions make it inviting and readable across book titles, catalog numbers, and patron contact sheets.

### Typographic Rules
- **Bi-directional Respect (RTL/LTR):** Rubik maintains symmetrical baseline heights between Hebrew and English, ensuring clean alignment in bilingual cataloging entries (e.g., author names alongside original Hebrew titles).
- **Weight Contrast:** Headlines utilize weights 600 and 700 to create clear navigational signposts. Body text remains at weight 400 for optical lightness on tinted rose-cream backgrounds.
- **Numbers & Dates:** Numeric due dates, phone contacts, and barcode numbers inherit `tabular-nums` formatting to ensure alignment in vertical lists.

## Layout & Spacing

The layout is built for standard and wide desktop monitors (laptops, all-in-one kitchen desk setups, and home office workstations).

### Desktop Structure
- **Grid Architecture:** 12-column fluid grid constrained to a maximum content container of `1440px`. Gutters sit at `1.5rem` (`24px`), framed by a generous outer page margin of `2.5rem` (`40px`).
- **Administrative Split-View:** Standard inventory views leverage an 8-column browsing grid alongside a 4-column quick-action patron drawer or check-out cart.
- **Vertical Rhythm:** Content modules follow strict increments of `0.5rem` (`8px`), with card interior paddings scaled between `space-md` (`1rem`) and `space-lg` (`1.5rem`) to maintain breathable density.

## Elevation & Depth

This system avoids cold synthetic box-shadows. Depth is established through **warm ambient diffusion, delicate gilded outlines, and tinted tonal layering**.

### Elevation Levels
- **Level 0 (Canvas):** Soft base cream (`#FDF8F3`).
- **Level 1 (Card & Module Resting):** Pure ivory surfaces (`#FFFFFF`) with a `1px` crisp hairline border in warm sand (`#E7E0D8`) accompanied by a subtle tinted bloom (`0 2px 8px -1px rgba(190, 24, 93, 0.04)`).
- **Level 2 (Hover / Active Book Cards):** Slight upward lift with an expanded warm shadow (`0 8px 24px -4px rgba(190, 24, 93, 0.08)`) and border emphasis in soft berry tone.
- **Level 3 (Modals, Overlays & Quick-Return Drawers):** Supported by a warm backdrop blur (`backdrop-filter: blur(4px)`) and a deep, comforting ambient perimeter shadow (`0 20px 40px -8px rgba(41, 37, 36, 0.16)`).

## Shapes

The shape hierarchy combines **structural stability with gentle, inviting curvature** (Level 2: Rounded).

### Geometry Guidelines
- **Standard Containers & Cards:** Base radius of `0.5rem` (`8px`) gives catalogs, book detail panels, and patron logs a tidy, orderly feel.
- **Hero Banners & Category Tiles:** Use `rounded-lg` (`1rem`) to feel welcoming and approachable.
- **Badges, Status Chips & Pill Buttons:** Pill geometry (full radius / `9999px`) is reserved exclusively for interactive chips, category selectors, and lending status badges, contrasting against square book cover representations.

## Components

### Buttons
- **Primary Action (Check Out / Lend / Add Book):** Solid Rich Berry (`#BE185D`) with white text, pill-shaped or soft `8px` radius, styled with subtle horizontal padding (`space-lg`), and crisp hover shifts to `#9D174D`.
- **Secondary Action (Reserve / Filter / Print Slips):** Saffron Amber outline (`1.5px`) over warm cream surface, using Amber `#D97706` typography.
- **Tertiary / Community Utility (Neighbor Contact / Notes):** Pale Teal tint background (`#CCFBF1`) with Deep Teal (`#0F766E`) text.

### Chips & Badges
- **Status Pills:** 
  - *Available / On Shelf:* Deep Teal background tint (`#E6FFFA`), Teal border, Teal bold text.
  - *Borrowed / With Family:* Warm Saffron Amber tint (`#FEF3C7`), text `#B45309`.
  - *Overdue / Needs Reminder:* Rich Berry tint (`#FCE7F3`), text `#9D174D`.
- **Category Tags:** Compact, fully-rounded pills with small inline dots denoting genres (*Children*, *Teens*, *Shabbos Reading*, *Cookbooks*).

### Input Fields & Search Bars
- **Catalog Search:** Generous `48px` height with inset Hebrew search icon, `#FFFFFF` interior, framed by a soft sand border (`#D6CEBE`). On focus, smoothly transitions to a Berry glow outline (`2px solid #BE185D`).
- **Form Controls:** Labels sit clearly above inputs in `Rubik Medium` (14px), with clear patron placeholder hints (e.g., *Family Name, Apt Number, Phone*).

### Book & Patron Cards
- **Book Display Card:** Clean white container with a 3:4 aspect-ratio book cover slot, title in `Rubik Bold` (16px), author attribution in neutral tone, and a quick-action "Check Out" icon button.
- **Family / Patron Row:** Compact tabular row displaying borrower name, active lent books count in pill chips, and WhatsApp/phone contact triggers with high contrast.

### Checkboxes & Radio Buttons
- Custom square-rounded checkboxes (`6px` radius) in `#BE185D` when active, containing a clean white checkmark. Hover states provide an amber-tinted ripple.