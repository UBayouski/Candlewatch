// Public surface of the session engine. Everything else in this folder is internal.
export {
  BREAK_MS,
  GHOST_FULL_SIZE_MS,
  GHOST_MIN_SIZE,
  INTENT_MAX_CODE_POINTS,
  MAX_LENGTH_MIN,
  MIN_LENGTH_MIN,
  MS_PER_MINUTE,
  PAUSE_LIMIT_MS,
  PRESET_LENGTHS_MIN,
  HISTORY_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
} from "./constants";
export { distractionCount, ghostSize, ghostSpansMs } from "./ghosts";
export { isBreak, timeLeftMs, waxFraction } from "./selectors";
export {
  parseHistory,
  readHistory,
  readSession,
  restoreState,
  serializeHistory,
  serializeSession,
} from "./serialize";
export type { ReadStatus } from "./serialize";
export { step } from "./step";
export { INITIAL_STATE } from "./types";
export type {
  BurnedOutState,
  Event,
  HistoryEntry,
  IdleState,
  LightEvent,
  LitState,
  Outcome,
  PausedState,
  Session,
  SnuffedState,
  State,
} from "./types";
