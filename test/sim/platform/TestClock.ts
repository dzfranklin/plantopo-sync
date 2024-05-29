import { Clock, ClockSource } from "../../../core/Clock.ts";

export class TestClock implements ClockSource {
  private _prevGlobal: ClockSource | null = null;
  private _tick = 1;
  private _timeouts: Timeout[] = [];

  static install(): TestClock {
    const clock = new TestClock();
    clock._prevGlobal = Clock.__debugGetGlobal();
    Clock.__debugSetGlobal(clock);
    return clock;
  }

  now(): number {
    this._tick++;
    return this._tick;
  }

  timeout(cb: () => void, delay: number): number {
    return this._push(cb, "timeout", delay);
  }

  cancelTimeout(timeout: number): void {
    this._cancel(timeout);
  }

  interval(cb: () => void, interval: number): number {
    return this._push(cb, "interval", interval);
  }

  cancelInterval(interval: number): void {
    this._cancel(interval);
  }

  pending(): string[] {
    return this._timeouts.map((t) => t.stack);
  }

  tick(): void {
    this._tick++;

    if (this._timeouts.length === 0) {
      return;
    }

    // Advance time to the next timeout
    const t = this._timeouts.toSorted((a, b) => a.at - b.at)[0];
    this._tick = Math.max(this._tick, t.at);

    // Run
    const toRun: Timeout[] = [];
    const done: Timeout[] = [];
    for (const timeout of this._timeouts) {
      if (timeout.at <= this._tick) {
        toRun.push(timeout);
        if (timeout.type === "timeout") {
          done.push(timeout);
        } else {
          timeout.base = this._tick;
        }
      }
    }
    this._timeouts = this._timeouts.filter((t) => !done.includes(t));
    for (const timeout of toRun) {
      timeout.cb();
    }
  }

  private _push(
    cb: () => void,
    type: "interval" | "timeout",
    ms: number
  ): number {
    const rawStack = new Error().stack!;
    const projectParentPath = rawStack
      .split("\n")[1]
      .match(/(\/.*?)plantopo-sync/)![1];
    const stack = rawStack
      .split("\n")
      .slice(3)
      .map((l) => l.replace(projectParentPath, "").trim())
      .join("\n");

    this._tick++;
    const timeout = new Timeout(this._tick, stack, type, cb, ms);
    this._timeouts.push(timeout);
    return this._tick;
  }

  private _cancel(id: number): void {
    this._tick++;
    this._timeouts = this._timeouts.filter((t) => t.id !== id);
  }

  [Symbol.dispose](): void {
    if (this._prevGlobal) {
      Clock.__debugSetGlobal(this._prevGlobal);
    }
  }
}

class Timeout {
  public id: number;
  public ms: number;
  constructor(
    public base: number,
    public stack: string,
    public type: "timeout" | "interval",
    public cb: () => void,
    ms: number
  ) {
    this.id = base;
    this.ms = Math.max(0, ms);
  }

  get at(): number {
    return this.base + this.ms;
  }
}
