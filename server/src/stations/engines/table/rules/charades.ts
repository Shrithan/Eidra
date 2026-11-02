import { current, advance, type Rule } from "../model.js";
const phrases = [
  "rainbow",
  "pizza party",
  "sleepy cat",
  "space station",
  "fishing boat",
  "haunted house",
  "snow day",
  "birthday cake",
  "camp fire",
  "rock concert",
  "garden gnome",
  "treasure island",
];
export const charades: Rule = {
  init(s, rng) {
    s.phrase = phrases[Math.floor(rng() * phrases.length)];
  },
  legal(s, id) {
    return id === current(s)
      ? Array.from({ length: 12 }, (_, choice) => ({ action: "emote", choice }))
      : [{ action: "guess" }];
  },
  apply(s, id, m) {
    if (id === current(s)) {
      if (
        m.action !== "emote" ||
        m.choice === undefined ||
        m.choice < 0 ||
        m.choice >= 12
      )
        return false;
      s.emotes.push(
        [
          "😀",
          "😴",
          "🐱",
          "🌈",
          "🍕",
          "🎉",
          "🚀",
          "🎣",
          "👻",
          "❄️",
          "🎂",
          "🏝️",
        ][m.choice],
      );
      return true;
    }
    if (m.action !== "guess" || !m.text) return false;
    if (m.text.trim().toLowerCase() === s.phrase) {
      s.scores[id] += 100;
      s.scores[current(s)] += 50;
      advance(s);
      s.round = s.moves;
      s.emotes = [];
      s.phrase = phrases[(s.moves * 7) % phrases.length];
      if (s.moves >= 6) s.ended = true;
    }
    return true;
  },
  view(s, id) {
    return {
      phrase: id === current(s) ? s.phrase : undefined,
      emotes: s.emotes,
    };
  },
};
