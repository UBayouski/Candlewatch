// The live-region writer (controls-and-access design 4.4, R9.2).
// `say` remembers the latest text; `frame` (once per frame, after apply) writes it. A repeat of the text the region already
// holds is written in two steps, clear then set, so a screen reader announces it again (the T key pressed twice).

/** What the writer needs from the region element. */
export interface LiveRegion {
  textContent: string | null;
}

export interface LiveWriter {
  /** Asks for a message (one line). If two are asked within one frame the last one wins; a repeat of the current text is cleared for one frame first. */
  say(text: string): void;
  /** Writes the pending message, if any. */
  frame(): void;
}

export function createLiveWriter(region: LiveRegion): LiveWriter {
  let pending: string | null = null;
  return {
    say(text: string): void {
      pending = text;
    },
    frame(): void {
      if (pending === null) return;
      if (region.textContent === pending) {
        // The same words again: empty the region this frame, set it in the next.
        region.textContent = "";
        return;
      }
      region.textContent = pending;
      pending = null;
    },
  };
}
