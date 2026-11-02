/** How a player looks (skin, clothes, hat, necklace), sent by their browser and shown to everyone else. Only plain, known values get through. */
const COLOR = /^#[0-9a-fA-F]{6}$/;
const HATS = new Set(['none', 'cap', 'crown', 'cowboy']);
const CHAINS = new Set(['none', 'gold', 'silver']);
export function cleanLook(v: unknown): string {
  let raw: unknown = v;
  if (typeof v === 'string') { if (v.length > 300) return ''; try { raw = JSON.parse(v); } catch { return ''; } }
  if (!raw || typeof raw !== 'object') return '';
  const o = raw as Record<string, unknown>;
  const color = (x: unknown) => (typeof x === 'string' && COLOR.test(x) ? x : null);
  const skin = color(o.skin), top = color(o.top), bottom = color(o.bottom), face = color(o.face);
  if (!skin || !top || !bottom || !face) return '';
  const hat = typeof o.hat === 'string' && HATS.has(o.hat) ? o.hat : 'none';
  const chain = typeof o.chain === 'string' && CHAINS.has(o.chain) ? o.chain : 'none';
  return JSON.stringify({ skin, top, bottom, face, hat, chain });
}
