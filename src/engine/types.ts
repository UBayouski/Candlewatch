export type Outcome = "burned-out" | "snuffed";

/** One focus session. Immutable; every change makes a new object. */
export interface Session {
  /** Milliseconds since the epoch, set by `light`. */
  readonly startedAt: number;
  /** Integer 5..90. */
  readonly lengthMin: number;
  /** Normalized intent, or null when empty. */
  readonly intent: string | null;
  /** Closed pause spans only, 0..PAUSE_LIMIT_MS. */
  readonly pausedTotalMs: number;
  /** Field only (R8); always 0 in this spec. */
  readonly distractions: number;
  /** Field only (R8); always 0 in this spec. */
  readonly timeAwayMs: number;
}

export interface HistoryEntry {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly lengthMin: number;
  readonly intent: string | null;
  readonly outcome: Outcome;
  readonly distractions: number;
  readonly timeAwayMs: number;
}

interface WithHistory {
  /** Oldest first, append-only (R10.2). Carried by every phase. */
  readonly history: readonly HistoryEntry[];
}

export interface IdleState extends WithHistory {
  readonly phase: "idle";
}

export interface LitState extends WithHistory {
  readonly phase: "lit";
  readonly session: Session;
  /** Start of the current burning segment: startedAt, or the instant of the last resume. */
  readonly litSince: number;
}

export interface PausedState extends WithHistory {
  readonly phase: "paused";
  readonly session: Session;
  /** Start of the open pause span. */
  readonly pausedAt: number;
}

export interface BurnedOutState extends WithHistory {
  readonly phase: "burned-out";
  readonly session: Session;
  /** True completion instant. */
  readonly endedAt: number;
  /** endedAt + BREAK_MS (R7.1). */
  readonly breakEndsAt: number;
}

export interface SnuffedState extends WithHistory {
  readonly phase: "snuffed";
  readonly session: Session;
  readonly endedAt: number;
}

export type State = IdleState | LitState | PausedState | BurnedOutState | SnuffedState;

export type LightEvent = {
  readonly type: "light";
  readonly length: number;
  readonly intent?: string;
};

export type Event =
  | LightEvent
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "snuff" }
  | { readonly type: "tick" }
  | { readonly type: "hide" }
  | { readonly type: "show" }
  | { readonly type: "reload"; readonly state: State };

export const INITIAL_STATE: IdleState = { phase: "idle", history: [] };
