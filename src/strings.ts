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
} as const;
