// The title adapter (sound-and-title design 3.8; R1.4, R6.10, R6.11, R6.12, R6.14). Effect file: the only code that writes the
// document's title. `doc` is the page's document, or in a test any object with a `title` string. No timer, no clock.

/** The part of the document the adapter uses. */
export interface TitleTarget {
  title: string;
}

export interface TitleAdapter {
  /** Write `title` to the document unless it is already what is shown. Never throws. */
  write(title: string): void;
  /** The last title this adapter knows the document holds: the last one written, or the one it found and kept. null before the first write. */
  last(): string | null;
}

export function createTitleAdapter(doc: TitleTarget): TitleAdapter {
  let known: string | null = null;
  return {
    write(title) {
      if (typeof title !== "string") return;
      try {
        if (known === null) {
          if (doc.title !== title) doc.title = title; // the first write compares with what the page holds (R6.14)
        } else if (known === title) {
          return; // equal to the last write: no write (R6.10)
        } else {
          doc.title = title;
        }
        known = title;
      } catch {
        // A document that throws on read or write: keep the old `known` so the next call tries again. Nothing is shown.
      }
    },
    last: () => known,
  };
}
