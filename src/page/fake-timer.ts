// FakeTimer (sound-and-title design 8.3). Test-only: never imported by a shipped file. It stands in for setTimeout and
// clearTimeout and owns a settable clock, so the Hidden_Tick runs on test time.

interface Armed {
  readonly id: number;
  readonly fn: () => void;
  readonly due: number;
  /** Set by cancel(). A cancelled timer is not live; it still runs if the timer was told to ignore cancels. */
  cancelled: boolean;
}

export interface FakeTimerOptions {
  /** The clock at the start, ms. */
  readonly start?: number;
  /**
   * When true, cancel() marks a timer as cancelled but it still runs when due: a browser that had already queued the task.
   * It no longer counts as live.
   */
  readonly ignoreCancel?: boolean;
}

export class FakeTimer {
  private now: number;
  private nextId = 1;
  private armed: Armed[] = [];
  private readonly ignoreCancel: boolean;
  /** Every schedule call: id, delay and the clock when it was made. */
  readonly scheduled: { readonly id: number; readonly ms: number; readonly at: number }[] = [];
  /** Every cancel call, by id. */
  readonly cancelled: number[] = [];
  /** How many callbacks ran. */
  runs = 0;

  constructor(options: FakeTimerOptions = {}) {
    this.now = options.start ?? 0;
    this.ignoreCancel = options.ignoreCancel === true;
  }

  /** The clock, ms. */
  readonly clock = (): number => this.now;

  setClock(t: number): void {
    this.now = t;
  }

  /** Arms `fn` to run `ms` from now; returns an incrementing id. */
  readonly schedule = (fn: () => void, ms: number): number => {
    const id = this.nextId++;
    this.scheduled.push({ id, ms, at: this.now });
    this.armed.push({ id, fn, due: this.now + ms, cancelled: false });
    return id;
  };

  readonly cancel = (id: number): void => {
    this.cancelled.push(id);
    const t = this.armed.find((a) => a.id === id);
    if (t === undefined) return;
    if (this.ignoreCancel) t.cancelled = true;
    else this.armed = this.armed.filter((a) => a !== t);
  };

  /** Armed timers that were not cancelled. */
  live(): number {
    return this.armed.filter((a) => !a.cancelled).length;
  }

  /** Every timer still to run, cancelled-but-queued ones included. */
  queued(): number {
    return this.armed.length;
  }

  /** The due time of the next timer to run, or null. */
  nextDue(): number | null {
    return this.next()?.due ?? null;
  }

  /** Moves the clock by `ms`, running due timers in order (by due time, then by id), each with the clock at its due time. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const t = this.next();
      if (t === undefined || t.due > target) break;
      this.run(t, Math.max(this.now, t.due));
    }
    this.now = Math.max(this.now, target);
  }

  /** Runs the next timer `ms` later than it is due (a throttled tab); the clock moves to that moment. False if none is armed. */
  lateBy(ms: number): boolean {
    const t = this.next();
    if (t === undefined) return false;
    this.run(t, Math.max(this.now, t.due + ms));
    return true;
  }

  private next(): Armed | undefined {
    let best: Armed | undefined;
    for (const a of this.armed) if (best === undefined || a.due < best.due || (a.due === best.due && a.id < best.id)) best = a;
    return best;
  }

  private run(t: Armed, at: number): void {
    this.armed = this.armed.filter((a) => a !== t);
    this.now = at;
    this.runs++;
    t.fn();
  }
}
