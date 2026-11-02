# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Twitch viewers discovering streams and spending time together, and streamers whose communities gather around their broadcasts.

## Product Purpose
Orbyx turns stream discovery and shared viewing into a navigable social world. Viewers explore a solar system, visit planets, enter streamer theatres, and interact with other viewers.

## Positioning
Twitch streams become places to visit together: walkable worlds and shared theatres connected to live Twitch chat.

## Operating Context
The existing multiplayer experience supports multiple participants exploring and interacting. The home page introduces what was built, why it exists, and how to enter. The introduction appears on every home-page visit; its top-right entry action opens the actual solar system at /world.

## Capabilities and Constraints
- Preserve existing multiplayer, streaming, authentication and interaction behavior.
- Twitch-only streams; never invent live audience claims or testimonials.
- Locations remain approximate and city-level; preserve the source and privacy rules in CONTRACT.md.
- Existing React/TypeScript/Vite frontend and Express/Colyseus backend.
- Real Twitch features depend on configured credentials; mock mode remains available.

## Brand Commitments
Orbyx is the product name. Preserve the colorful, blocky, Crossy Road-inspired 3D world and solar-system setting. The user explicitly selected Twitch-inspired interface styling across the intro and world: self-hosted Inter typography (including planet labels), charcoal surfaces, crisp controls and strong purple actions. Orbyx retains its own name and orbital identity.

## Evidence on Hand
The running app, README.md, CONTRACT.md, the existing solar-system renderer and shared theatres. The user confirms that multiple people can currently join and interact. No verified testimonials or impact metrics were provided.

## Product Principles
- Help people understand the world before asking them to enter it.
- Make stream discovery spatial and social.
- Keep the existing world and its interactions accessible through a clear entry action.
- Preserve location privacy and distinguish demonstrations from live data.

## Introduction motion
The user requested a more immersive introduction with scroll-driven orbital movement, additional animation and a cinematic entry into the existing solar system. Orbyx replaces Watchworld as the visible website name; internal persistence and protocol identifiers remain compatible.
