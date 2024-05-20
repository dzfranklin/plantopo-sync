export interface Rng {
  /** Returns a pseudorandom number between 0 and 1. */
  random(): number;
}

export class CoreRng implements Rng {
  random() {
    return Math.random();
  }
}
