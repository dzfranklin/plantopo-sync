export interface Looper {
  loop(cb: (tick: number) => void): () => void;
}

export class IntervalLooper implements Looper {
  private _tick = 0;

  constructor(public readonly timeoutMs: number) {}

  loop(cb: (tick: number) => void): () => void {
    const id = setInterval(() => cb(this._tick++), this.timeoutMs);
    return () => clearInterval(id);
  }
}

export class ManualLooper implements Looper {
  private _instances = new Set<ManualLooperInstance>();

  loop(cb: (tick: number) => void): () => void {
    const instance = new ManualLooperInstance(cb);
    this._instances.add(instance);
    return () => {
      this._instances.delete(instance);
    };
  }

  tick() {
    this._instances.forEach((instance) => instance.tick());
  }
}

class ManualLooperInstance {
  private _tick = 0;

  constructor(private _cb: (tick: number) => void) {}

  tick() {
    if (this._cb) {
      this._cb(this._tick++);
    }
  }
}
