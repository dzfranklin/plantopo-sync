import { PGCSource } from "./PGCSource.ts";
import { PlatformRandomSource } from "../platform/PlatformRandomSource.ts";
import { monotonicFactory as monotonicULIDFactory } from "./ulid.ts";

export class Random {
  private _ulidFactory = monotonicULIDFactory(() => this.float());

  constructor(private source: RandomSource) {}

  static withSeed(seed: number): Random {
    return new Random(new PGCSource(1, seed, 1, 1));
  }

  /** Generates a random integer r where min <= r < max */
  int(min: number, max: number): number {
    return min + this._bounded(max - min);
  }

  /** Generates a random integer r where min <= r < max */
  static int(min: number, max: number): number {
    return global.int(min, max);
  }

  /** Generates a random number r where 0 <= r < 1 */
  float(): number {
    return this.source.next32() / 2 ** 32;
  }

  /** Generates a random number r where 0 <= r < 1 */
  static float(): number {
    return global.float();
  }

  /** Generates a random number r where 0 <= r < 1 with a normal distribution */
  normal(): number {
    // Adapted from <https://stackoverflow.com/a/49434653>
    let u = 0,
      v = 0;
    while (u === 0) u = this.float(); //Converting [0,1) to (0,1)
    while (v === 0) v = this.float();
    let num = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    num = num / 10 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) return this.normal(); // resample between 0 and 1
    return num;
  }

  /** Generates a random number r where 0 <= r < 1 with a normal distribution */
  static normal(): number {
    return global.normal();
  }

  ulid(): string {
    return this._ulidFactory();
  }

  static ulid(): string {
    return global.ulid();
  }

  of<T>(array: T[]): T {
    return array[this.int(0, array.length)];
  }

  static of<T>(array: T[]): T {
    return global.of(array);
  }

  // Generate a uniformly distributed number, r, where 0 <= r < bound
  private _bounded(bound: number): number {
    // Adapted from <https://github.com/imneme/pcg-c-basic/blob/bc39cd76ac3d541e618606bcc6e1e5ba5e5e6aa3/pcg_basic.c>

    // To avoid bias, we need to make the range of the RNG a multiple of bound,
    // which we do by dropping output less than a threshold. In essence, we do
    // uint32_t threshold = (0x100000000ull-bound) % bound
    const threshold = -bound % bound;

    // Uniformity guarantees that this loop will terminate.  In practice, it
    // should usually terminate quickly; on average (assuming all bounds are
    // equally likely), 82.25% of the time, we can expect it to require just
    // one iteration.  In the worst case, someone passes a bound of 2^31 + 1
    // (i.e., 2147483649), which invalidates almost 50% of the range.  In
    // practice, bounds are typically small and only a tiny amount of the range
    // is eliminated.
    for (;;) {
      const r = this.source.next32();
      if (r >= threshold) return r % bound;
    }
  }

  static __debugSetGlobal(source: RandomSource) {
    global = new Random(source);
  }
}

let global = new Random(PlatformRandomSource);

export interface RandomSource {
  next32(): number;
  float(): number;
}

export function __debugWithGlobalRng<T>(source: RandomSource, fn: () => T): T {
  const old = global;
  global = new Random(source);
  try {
    return fn();
  } finally {
    global = old;
  }
}
