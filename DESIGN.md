---
name: Orbyx world HUD
description: Purple world HUD and immersive orbital introduction
colors:
  primary: "#bf94ff"
  action: "#9146ff"
  action-ink: "#ffffff"
  surface: "#18181b"
  raised: "#1f1f23"
  input: "#0e0e10"
  line: "#35353b"
  ink: "#efeff1"
  muted: "#adadb8"
  active: "#302443"
  landing-bg: "#0e0e10"
  landing-ink: "#efeff1"
  landing-muted: "#adadb8"
  landing-accent: "#bf94ff"
typography:
  display:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "23px"
    fontWeight: 800
    letterSpacing: "-.035em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  control: "4px"
  action: "4px"
  surface: "6px"
  dialog: "6px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "22px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.action}"
    padding: "12px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  panel:
    backgroundColor: "#18181b"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "{spacing.panel}"
---

# Design System: Orbyx world HUD

## Overview

**Creative North Star: "Orbital HUD"** (implementation description).

This document records the Twitch-inspired interface explicitly requested by the user, implemented by `twitch-ui.css` over the established HUD and introduction. Charcoal surfaces, vivid purple actions and self-hosted Inter unify the website while Orbyx remains the visible identity.

Colorful blocky worlds, avatars, orbital animation and existing interactions retain their established visual language. Persistence and protocol identifiers remain compatible. Surface composition belongs in the welcome and world-HUD briefs.

**Key Characteristics:**
- Charcoal interface surfaces and purple actions with white text.
- Compact Inter typography across interface and canvas labels.
- Small corners, restrained depth and visible keyboard focus.

## Colors

### Primary
Vivid purple anchors primary actions and the introduction’s explanation band. Pale purple supports selection, emphasis and focus. Purple actions use white labels.

### Neutral
Charcoal backgrounds and slightly lighter panels separate the interface from the scene. Pale ink supports primary copy; muted neutral text supports secondary information. Semantic world and category colors remain game content.

## Typography

**Display Font:** Inter, Arial, sans-serif. **Body Font:** Inter, Arial, sans-serif.

Inter is the explicit Twitch-reference choice, overriding generic warnings against common interface fonts. The variable font is self-hosted under `web/public/fonts/inter/` with its OFL license, declared at weights 100–900 and preloaded by the document. All interface headings, body copy and canvas label declarations use Inter; canvas textures repaint after font delivery.

Introduction headings use weight 800, line height 1.04 and tracking (-.04em). The hero scales from (48–88px), with a mobile (40–60px) range. World headings and labels use stronger weights for quick scanning; dense copy retains the existing compact scale. Planet labels replace rounded lettering with Inter and a restrained dark outline.

## Layout

The desktop top bar is a single (76px) navigation surface. Search is centered at `clamp(230px,34vw,560px)`; side rails begin at (96px), with the left rail (224px) wide. Bottom controls, home information and Phone retain their existing anchors and interaction purpose.

Breakpoints are (1100px), (900px) and (620px). At (900px) and below the header becomes (122px), search occupies a second row, and character/quest menus are fixed below the header. At (620px) and below menus fit viewport width with (12px) gutters and Phone width is capped by the viewport. The right rail scrolls instead of forcing its contents to shrink. Header stacking is (50), above the existing Phone dock (35), so opened menus remain clickable.

The introduction uses a fixed viewport scroll container, sticky header and fixed decorative scene. Its responsive breakpoints are (900px) and (620px); narrow layouts use (6vw) gutters and a single-column narrative. The angled ticker is contained within the page width.

## Elevation & Depth

Flat bordered rails use tonal separation with no shadow. Search results, dialogs, Phone and contextual cards use structural shadows to distinguish overlapping surfaces. Common dialog elevation is `0 18px 50px #0008`; Phone uses `0 16px 40px #0007`. Phone and home card remove backdrop blur. This treatment applies to HUD layers, not scene lighting.

## Shapes

Controls use small corners (3–4px); standard overlay surfaces and dialogs use (6px). Thin neutral borders organize dense panels. World objects and workshop pixels retain their original geometry; workshop pixel buttons explicitly have zero radius, padding and border.

## Components

### Buttons
Primary actions use vivid purple with white ink. Secondary actions use charcoal fills with pale text and restrained boundaries. Buttons transition background, border and text over (.16s ease), with transitions removed for reduced motion. Keyboard focus is a (2px) pale purple outline offset by (3px). Disabled controls use the default cursor; no new disabled behavior is introduced.

### Cards / Containers
Rails are flat, near-opaque dark surfaces. Contextual interaction cards and dialogs have stronger borders and structural shadow. Existing dialog padding is retained; lists and mobile surfaces are more compact. Existing content, ordering and click targets remain authoritative.

### Inputs / Fields
Dark wells, muted placeholders and small corners distinguish editable fields. General dialog fields have a (36px) minimum height. Search uses its own (42px) desktop height and small corners. Carets retain the existing accent treatment. Existing field validation and submission behavior are unchanged.

### Navigation
Search results and rail rows use the neutral or dark-purple fill for hover or selection. The header groups title, search, Character, Quests and authentication actions. Character and quest panels share dialog styling. Phone tabs use a dark inset track with a brighter selected-purple tab. Chat tabs follow the same selected-state language.

### Landing entry and orbital scene
The introduction uses purple entry anchors with white ink, (4px) corners, visible pale-purple focus, and (46px) minimum height; large actions use (56px). A slow ticker, intersection reveals (.8s), scroll-linked scene rotation and subtle orbital motion support the story. Entry plays a departure tunnel for (950ms), then reveals the existing world through a (1s) arrival overlay. Reduced motion stops animation, exposes reveals immediately and enters without delay. The decorative lazy-loaded scene uses bounded DPR (1–1.5), demand rendering while hidden or reduced-motion, and loading/error fallbacks.

### Phone and shared-world overlays
Phone favors readable content over decorative device chrome. Chat, nearby-player interactions, notices and playback dialogs share the purple overlay language. Theatre chat/bar and station HUD/prompt rules are implemented in source; their runtime review remains limited as recorded in the surface brief.

## Do's and Don'ts

### Do:
- Do use the HUD palette on the existing interface overlay.
- Do preserve navigation handlers, gameplay, multiplayer, authentication and playback behavior.
- Do keep opened header menus above the floating Phone control.

### Don't:
- Don't recolor the existing 3D worlds or change scene composition for this interface reference.
- Don't treat source-only theatre or station styling as browser-verified.
- Don't restyle workshop pixel cells as ordinary buttons.
