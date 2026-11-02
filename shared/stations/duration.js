export function roundDuration(def, playerCount) {
  return def.engine === "workshop"
    ? Math.max(
        def.roundSeconds,
        10 + Number(def.config.makeSeconds ?? 140) + playerCount * 6 + 15,
      )
    : def.roundSeconds;
}
