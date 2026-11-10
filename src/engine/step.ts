import { MAX_LENGTH_MIN, MIN_LENGTH_MIN } from "./constants";
import { normalizeIntent } from "./intent";
import { endSnuffed, settle } from "./settle";
import type { Event, LightEvent, LitState, PausedState, State } from "./types";

/**
 * The session engine: (state, event, now) -> state. Pure and DOM-free.
 * - A non-finite `now` returns the state unchanged; `now` is floored (R12.4).
 * - `hide` and `show` return the same reference and never settle (R8.2, R5.4).
 * - `tick` and `reload` only settle (R5.3, R9.2).
 * - Every other event settles first, then is handled in the settled phase (R5.4).
 * - An event that is not valid in the current phase returns the (settled) state (R1.3).
 */
export function step(state: State, event: Event, now: number): State {
  if (!Number.isFinite(now)) return state;
  const t = Math.floor(now);

  switch (event.type) {
    case "hide":
    case "show":
      return state;
    case "reload":
      return isStateLike(event.state) ? settle(event.state, t) : state;
    case "tick":
      return settle(state, t);
    default:
      break;
  }

  const s = settle(state, t);
  switch (event.type) {
    case "light":
      return light(s, event, t);
    case "pause":
      return s.phase === "lit" ? pause(s, t) : s;
    case "resume":
      return s.phase === "paused" ? resume(s, t) : s;
    case "snuff":
      return s.phase === "lit" || s.phase === "paused" ? snuff(s, t) : s;
    default: {
      // Exhaustive at compile time; at run time an unknown event leaves the state alone (R12.2).
      const unreachable: never = event;
      void unreachable;
      return s;
    }
  }
}

function isStateLike(value: unknown): value is State {
  return typeof value === "object" && value !== null && "phase" in value && "history" in value;
}

function light(s: State, e: LightEvent, t: number): State {
  if (s.phase === "lit" || s.phase === "paused") return s; // R2.5
  if (!Number.isInteger(e.length) || e.length < MIN_LENGTH_MIN || e.length > MAX_LENGTH_MIN) return s; // R2.2, R2.3
  return {
    phase: "lit",
    history: s.history,
    litSince: t,
    session: {
      startedAt: t,
      lengthMin: e.length,
      intent: normalizeIntent(e.intent),
      pausedTotalMs: 0,
      distractions: 0,
      timeAwayMs: 0,
    },
  };
}

function pause(s: LitState, t: number): PausedState {
  return { phase: "paused", history: s.history, session: s.session, pausedAt: Math.max(t, s.litSince) };
}

function resume(s: PausedState, t: number): LitState {
  const at = Math.max(t, s.pausedAt); // R4.5: never a negative span
  const span = at - s.pausedAt; // within the allowance, because settle already ran (R3.6)
  return {
    phase: "lit",
    history: s.history,
    litSince: at,
    session: { ...s.session, pausedTotalMs: s.session.pausedTotalMs + span },
  };
}

function snuff(s: LitState | PausedState, t: number) {
  const anchor = s.phase === "lit" ? s.litSince : s.pausedAt;
  return endSnuffed(s, Math.max(t, anchor)); // R6.1: now, never before the last anchor
}
