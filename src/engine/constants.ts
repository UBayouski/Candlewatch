export const MS_PER_MINUTE = 60_000;
/** Presets for the UI. The engine treats them as ordinary lengths (R2.3). */
export const PRESET_LENGTHS_MIN = [15, 25, 50] as const;
export const MIN_LENGTH_MIN = 5;
export const MAX_LENGTH_MIN = 90;
export const INTENT_MAX_CODE_POINTS = 80;
/** Total paused time allowed per session (R3.4). */
export const PAUSE_LIMIT_MS = 600_000;
/** Length of the optional break after a burned-out session (R7.1). */
export const BREAK_MS = 300_000;
/** Schema version of the serialized current-session document (R10.2). Version 1 documents are still read. */
export const SESSION_SCHEMA_VERSION = 2;
/** Schema version of the serialized history document (R10.2, R10.4). */
export const HISTORY_SCHEMA_VERSION = 1;
/** Smallest ghost size, so that every counted distraction is visible (R9.2). */
export const GHOST_MIN_SIZE = 0.25;
/** Time away at which a ghost reaches full size (R9.2). */
export const GHOST_FULL_SIZE_MS = 5 * MS_PER_MINUTE;
