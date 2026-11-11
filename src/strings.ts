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
  /** The setup form: length chooser, intent field, Light (controls-and-access design 8.9). {n}, {max} are filled by `fill`. */
  setup: {
    label: "Light a candle",
  },
  length: {
    group: "Length",
    preset: "{n} minutes",
    custom: "Custom length in minutes",
    placeholder: "min",
  },
  intent: {
    label: "What is this candle for? (optional)",
    hint: "Only the first {max} characters are kept.",
    count: "{n} of {max}",
    overLimit: "{max}+",
  },
  light: {
    light: "Light",
    again: "Light another",
  },
  pause: {
    pause: "Pause",
    resume: "Resume",
  },
  /** The snuff dialog (R6): "Keep burning" is the safe answer and takes focus first. */
  snuff: {
    open: "Let it go dark",
    title: "Let it go dark?",
    body: "The candle keeps burning while you decide.",
    keep: "Keep burning",
    confirm: "Snuff it",
  },
  settings: {
    open: "Settings",
    title: "Settings",
    sound: "Sound",
    ghosts: "Ghosts",
    defaultLength: "Default length",
    on: "On",
    off: "Off",
    close: "Close",
  },
  /** The status line under the time text (design 7.2). The ones shown while Pause and Let it go dark are on screen are kept short. */
  status: {
    firstVisit: "Enter lights. Space pauses. Esc lets it go dark.",
    idle: "The candle waits.",
    lit: "The wick catches.",
    guttering: "The flame gutters.",
    pauseLeft: "Pause left {time}",
    cools: "The wax cools.",
    burnedOut: "The watch is over. Morning.",
    snuffed: "The flame is out.",
    lengthRange: "Choose {min} to {max} minutes.",
  },
  /** What the live region says (design 9.2). {time} is a time in words. */
  announce: {
    lit: "The wick catches. {time} left.",
    restored: "The candle is burning. {time} left.",
    paused: "Paused.",
    resumed: "The flame steadies.",
    q75: "A quarter is gone. {time} left.",
    q50: "Half is gone. {time} left.",
    q25: "Three quarters gone. {time} left.",
    lastMinute: "One minute left. The flame gutters.",
    burnedOut: "The watch is over. Morning.",
    snuffed: "The candle is out.",
    refused: "Choose {min} to {max} minutes.",
    timeOnRequest: "{time} left.",
    timeOnRequestPaused: "{time} left. Paused.",
    limit: "Only the first {max} characters are kept.",
  },
  region: {
    watch: "The watch",
  },
} as const;