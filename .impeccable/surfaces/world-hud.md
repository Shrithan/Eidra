# World HUD

## Mode and authority

Operate mode. Approved full UI/HUD redesign with purple as the main interface color. The user’s subsequent Twitch-inspired typography and UI request is implemented in `web/src/integration/twitch-ui.css` over `hud.css`; DESIGN.md captures its implemented tokens. This approval concerns the HUD surface and does not establish a new universal brand direction.

## Scope

World navigation header, search and results, category/leaderboard rails, bottom controls, Character and Quests panels, Phone, home controls, contextual/player interaction cards, chat, notices, theatre chrome and station HUD/prompt chrome. The same interface reference now covers the welcome surface. Preserve 3D worlds, rendering, world colors, models, avatars and scene composition.

## Behavior constraint

Presentation only. Preserve handlers, navigation and interaction semantics, multiplayer, authentication, playback, streaming and gameplay behavior. Workshop pixel cells remain game content. No additional audience claims or product capabilities are implied.

## Visual decisions

Use charcoal backgrounds (#0e0e10), panels (#18181b), vivid-purple primary actions (#9146ff) with white text, and pale-purple emphasis. Self-hosted Inter replaces rounded display lettering throughout UI and canvas label declarations, explicitly following the user’s Twitch reference. Compact bordered rails stay flat; overlapping panels use restrained structural shadows. The header has z-index 50 above Phone dock z-index 35; Character/Quests menus must remain reachable while Phone is open, including mobile.

## Evidence and limitations

Source inspected: PRODUCT.md, web/src/integration/hud.css, web/src/styles.css and web/src/sphere.css. Browser checks reported by the implementing/reviewing agents cover search, Character, Quests, Phone and mobile layout. The initial reviewer found a mobile Phone/menu overlap; header stacking was subsequently fixed and the hit test passes. Final review accepted shipping at the requested fix scope after visual review and hit testing of the stacking fix. The implementing agent reports the final web production build and `git diff --check` pass. Theatre and stations were inspected in source only; do not represent them as browser-verified. Engine and detector tools were unavailable. This documenter did not independently repeat browser checks.

## Twitch-reference finish review

Desktop and mobile intro/world captures plus the mobile Character panel were inspected in `.impeccable/review/twitch/`. No blocking clipping or style regression was found. Mobile HUD density is retained. The implementing agent confirmed loaded Inter, home-to-world entry, Back restoration, Character open/close and equal client/scroll width at 375px. These checks do not imply a fresh end-to-end review of theatre, stations or multiplayer. Animation, gameplay and compatible protocol identifiers remain constrained to existing behavior.
