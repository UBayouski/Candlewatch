export const STRINGS = {
  title: "Candlewatch",
  tagline: "Keep the candle lit.",
  /** The accessible name of the scene, one per flame mode (candle-scene R12). It never includes the time. */
  scene: {
    unlit: "An unlit candle.",
    steady: "The candle burns.",
    paused: "The flame is low and blue.",
    guttering: "The flame gutters.",
    smoke: "Smoke curls from the wick.",
  },
  /** Times in words and the placeholder for a time that cannot be shown (controls-and-access design 3.1, 8.9). {n} and {time} are filled by `fill`. */
  time: {
    minute: "{n} minute",
    minutes: "{n} minutes",
    second: "{n} second",
    seconds: "{n} seconds",
    timeLeft: "{time} left",
    timeUnknown: "--:--",
  },
} as const;
