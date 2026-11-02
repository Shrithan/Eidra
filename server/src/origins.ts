/** Which web addresses may talk to this server, and whether it fills empty seats with bots. */
const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
/** The public address of the site when deployed (https://...). Left unset in development. */
/** Render fills RENDER_EXTERNAL_URL in by itself, so a Render deploy needs no address to be typed in. */
/** A Twitch redirect address that is not on this machine also tells us where the site lives. */
const fromRedirect = (() => { try { const u = new URL(process.env.TWITCH_REDIRECT_URI ?? ''); return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? undefined : u.origin } catch { return undefined } })()
const deployed = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || fromRedirect
export const IS_DEPLOYED = Boolean(deployed)
export const PUBLIC_URL = (deployed ?? 'http://localhost:5173').replace(/\/$/, '')
export const ORIGINS = [...new Set([PUBLIC_URL, ...extra])]
/** BOTS=0 turns every bot off: no practice opponents, no bot stand-ins for players who leave. */
export const BOTS = process.env.BOTS !== '0'
