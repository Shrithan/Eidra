# Orbyx welcome surface

## Overview

Mode: **Persuade**. The home introduction explains spatial stream discovery, shared theatres and Twitch chat before inviting entry. It appears on every home-page visit. The approved direction retains purple, the colorful blocky space setting and a code-first implementation; Orbyx is the visible name. Existing `watchworld` persistence and protocol identifiers stay compatible.

The implementation lives in `Welcome.tsx`, `WelcomeOrbit.tsx` and `welcome.css`; the route wrapper is in `App.tsx`. Root `DESIGN.md` records shared and scoped tokens without replacing the established world HUD.

## Colors

The Twitch-inspired introduction uses charcoal background (#0e0e10), panels (#18181b), pale ink (#efeff1), muted neutral copy (#adadb8), pale-purple emphasis (#bf94ff), and vivid-purple actions and explanation band (#9146ff) with white text. Decorative city-planet colors remain unchanged.

## Typography

Self-hosted variable Inter provides brand, headings, ticker and body copy, explicitly following the user’s Twitch reference. The font and OFL license live in `web/public/fonts/inter/`; the document preloads it. Headings use weight 800, line height 1.04 and tracking (-.04em). The hero uses `clamp(48px,6.2vw,88px)`, reduced to `clamp(40px,10.5vw,60px)` on mobile. Supporting copy retains its generous line height.

## Layout

A fixed full-window scroll container holds a sticky entry header, opening statement, angled ticker, three narrative stops, purple explanation band and closing entry. The fixed low-poly city-planet scene stays behind the story and responds to normalized scroll progress; a sticky wayfinder marks the active stop. Oversized outlined lettering also moves with progress.

Desktop gutters are generally 5vw. At 900px the scene and header compress; at 620px narrative content becomes single-column with 6vw gutters and the scene sits below the opening copy. The ticker uses a contained skew rather than an overwide rotation. Browser verification at 375px showed client and scroll widths both 375px.

## Elevation & Depth

Depth comes from the actual lazy-loaded React Three Fiber scene: faceted city planets, orbit rings, a central hub and stars. The scene is decorative, pointer-inert and described by an accessible wrapper; the canvas is hidden from assistive technology. Suspense and an error boundary retain a visible fallback. Bounded DPR (1–1.5), capped frame delta and demand rendering while hidden or reduced-motion limit unnecessary work.

## Shapes

Small-corner actions (4px), fine orbital lines, diamond separators and low-poly buildings preserve the spatial identity. The middle narrative stop uses a dark bordered reading panel (6px corners); the rest favors open composition and broad color fields.

## Components

- **Entry:** real `/world` anchors in the header, hero and finale. Ordinary clicks trigger a 950ms departure tunnel with a polite status label, then the same-runtime world mount and a 1s arrival reveal. Modifier clicks retain native navigation. Browser Back returns home; direct `/world` opens the existing experience.
- **Scroll motion:** scene rotation and framing follow scroll progress alongside slow idle motion; the ticker loops over 36s. Intersection reveals use .8s opacity/position transitions. The active wayfinder follows the narrative stops.
- **Reduced motion:** entry has no intentional delay, arrival is hidden, reveals are immediate, smooth scrolling becomes automatic and decorative CSS/scene animation stops. Preference changes are observed for the scene.
- **Accessibility:** semantic sections, one main heading, skip link, descriptive scene wrapper and visible 2px pale-purple focus outlines. Decorative marks, ticker and wayfinder are hidden from assistive technology.

## Do's and Don'ts

- Do retain every-visit home introduction, immediate header entry and existing multiplayer, streaming, authentication and interaction behavior.
- Do explain real capabilities in concrete terms and preserve approximate city-level location privacy under `CONTRACT.md`.
- Do keep landing motion and tokens scoped to this surface; preserve the documented HUD system.
- Don't invent testimonials, live audience counts or impact metrics.
- Don't rename compatible persisted identifiers merely to match the visible brand.

## Verification

Twitch-reference screenshots of desktop/mobile intro and world plus mobile Character were inspected with no blocking clipping or style regression. The implementing agent confirmed local Inter loaded, entry transition to `/world`, Back restoration and no horizontal overflow at 375px. Existing motion and reduced-motion behavior are retained. This scoped review does not imply fresh end-to-end verification of every world interaction.
