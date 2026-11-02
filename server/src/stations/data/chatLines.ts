// Authored fictional community prompts. These are never collected from Twitch chat.
const subjects = [
  "the snack drawer",
  "my keyboard",
  "the loading screen",
  "the garden gnome",
  "the last checkpoint",
  "our spaceship",
  "the tiny frog",
  "this sandwich",
  "the rain cloud",
  "my fishing rod",
  "the cozy blanket",
  "the speedrun timer",
  "the disco ball",
  "the village fountain",
  "my rubber duck",
  "the mystery door",
  "the moon",
  "our campfire",
  "the pixel artist",
  "the friendly dragon",
];
const endings = [
  "deserves its own fan club.",
  "has unexpectedly become the main character.",
  "is carrying the whole team today.",
  "needs a dramatic theme song.",
  "just unlocked a secret achievement.",
  "belongs in a museum of good ideas.",
  "is ready for the weekend.",
  "would make an excellent co-host.",
  "has impeccable timing.",
  "is taking a well-earned snack break.",
];
export const CHAT_LINES = subjects.flatMap((subject) =>
  endings.map(
    (ending) => `${subject[0].toUpperCase()}${subject.slice(1)} ${ending}`,
  ),
);
