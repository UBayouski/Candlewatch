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
    /** The cue in the empty custom field: an underscore to type over, so it does not look like a fourth preset. */
    placeholder: "__ min",
  },
  intent: {
    label: "What is this candle for? (optional)",
    /** The visible hint in the compact layout, where the field is 128 px wide at 360 x 640 and the full label would be cut. */
    placeholderShort: "Intent (optional)",
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
    /** The first-visit line when the device has no fine pointer (a phone or tablet): no keys to name. */
    firstVisitTouch: "Tap Light to begin. Tap pause to rest.",
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
  /** Distraction counts in words, used by the scene label (ghosts-and-graveyard design 4.7). Placeholder wording. */
  count: { distraction: "{n} distraction", distractions: "{n} distractions" },
  ghosts: { overflow: "+{n}" },
  /** The graveyard and shelf view (ghosts-and-graveyard design 4.7). Placeholder wording, finalised by sound-and-title. */
  graveyard: {
    door: "Open the graveyard",
    back: "Back to the room",
    title: "The graveyard",
    graveyardLabel: "Graveyard",
    shelfLabel: "Shelf",
    noStones: "No stones yet",
    noStubs: "No candles on the shelf yet",
    noIntent: "No intent",
    itemName: "{intent}, {date}",
    carvedDate: "{day} {month}",
    unknownDate: "Unknown date",
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    olderStone: "{n} older stone not shown",
    olderStones: "{n} older stones not shown",
    olderDay: "{n} older day not shown",
    olderDays: "{n} older days not shown",
    more: "+{n} more",
    card: { planned: "Planned: {time}", distractions: "Distractions: {n}", away: "Time away: {time}" },
    announceOpen: "The graveyard.",
    announceLeave: "Back in the room.",
  },
} as const;