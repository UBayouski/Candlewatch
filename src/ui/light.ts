// Turning the chooser and the intent field into a `light` event, or a refusal (controls-and-access R2.6, R3.3, R4.2;
// design 3.3). Pure. The intent is passed on unchanged: the engine is the one place that normalizes it (session-engine R2.4).
import type { LightEvent } from "../engine";
import { lengthOf } from "./length";
import type { LengthChoice } from "./length";

export type LightRequest =
  | { readonly ok: true; readonly event: LightEvent }
  | { readonly ok: false; readonly reason: "empty" | "format" | "range" };

/**
 * A valid length gives `{ type: "light", length, intent }` with the intent text exactly as typed (the `intent` key is left
 * out when the text is empty). An invalid length gives a refusal with the reason, and no event exists to send.
 */
export function lightRequest(choice: LengthChoice, intentText: string): LightRequest {
  const length = lengthOf(choice);
  if (!length.ok) return { ok: false, reason: length.reason };
  const event: LightEvent = intentText === "" ? { type: "light", length: length.minutes } : { type: "light", length: length.minutes, intent: intentText };
  return { ok: true, event };
}
