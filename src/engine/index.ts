// Public surface of the session engine. Everything else in this folder is internal.
export {
  BREAK_MS,
  INTENT_MAX_CODE_POINTS,
  MAX_LENGTH_MIN,
  MIN_LENGTH_MIN,
  MS_PER_MINUTE,
  PAUSE_LIMIT_MS,
  PRESET_LENGTHS_MIN,
  SCHEMA_VERSION,
} from "./constants";
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
