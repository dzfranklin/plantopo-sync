import { RandomSource } from "./mod.ts";

// Adapted from <https://github.com/imneme/pcg-c-basic/blob/bc39cd76ac3d541e618606bcc6e1e5ba5e5e6aa3/pcg_basic.c>
// and <https://github.com/thomcc/pcg-random/blob/master/pcg-random.js>

/*
 * PCG Random Number Generation for C.
 *
 * Copyright 2014 Melissa O'Neill <oneill@pcg-random.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * For additional information about the PCG random number generation scheme,
 * including its license and other licensing options, visit
 *
 *       http://www.pcg-random.org
 */

/*
 * This code is derived from the full C implementation, which is in turn
 * derived from the canonical C++ PCG implementation. The C++ version
 * has many additional features and is preferable if you can use C++ in
 * your project.
 */

// struct pcg_state_setseq_64 {    // Internals are *Private*.
//     uint64_t state;             // RNG state.  All values are possible.
//     uint64_t inc;               // Controls which RNG sequence (stream) is
//                                 // selected. Must *always* be odd.
// };
// typedef struct pcg_state_setseq_64 pcg32_random_t;
export class PGCSource implements RandomSource {
  private stateHi: number = 0;
  private stateLo: number = 0;
  private incHi: number = 0;
  private incLo: number = 0;

  constructor(stateHi: number, stateLo: number, seqHi: number, seqLo: number) {
    // rng->state = 0U;

    // rng->inc = (initseq << 1u) | 1u;
    const il32 = seqLo >>> 0;
    const ih32 = seqHi >>> 0;
    const incLoMsb = (il32 >>> 31) & 1;
    const incLo0 = ((il32 << 1) | 1) >>> 0;
    const incHi0 = (((ih32 << 1) >>> 0) | incLoMsb) >>> 0;
    this.incLo = incLo0;
    this.incHi = incHi0;

    // pcg32_random_r(rng);
    this.next32();

    // rng->state += initstate;
    const [newstate_lo, newstate_hi] = add64(
      this.stateLo,
      this.stateHi,
      stateLo >>> 0,
      stateHi >>> 0
    );
    this.stateLo = newstate_lo;
    this.stateHi = newstate_hi;

    // pcg32_random_r(rng);
    this.next32();
  }

  next32(): number {
    // uint64_t oldstate = rng->state;
    const oldHi = this.stateHi;
    const oldLo = this.stateLo;

    // rng->state = oldstate * 6364136223846793005ULL + rng->inc;
    const [newstate_lo, newstate_hi] = add64(
      ...mul64(oldLo, oldHi, 1284865837, 1481765933),
      this.incLo,
      this.incHi
    );
    this.stateLo = newstate_lo;
    this.stateHi = newstate_hi;

    // uint32_t xorshifted = ((oldstate >> 18u) ^ oldstate) >> 27u;
    // uint32_t rot = oldstate >> 59u;
    // return (xorshifted >> rot) | (xorshifted << ((-rot) & 31));
    let xsHi = oldHi >>> 18;
    let xsLo = ((oldLo >>> 18) | (oldHi << 14)) >>> 0;
    xsHi = (xsHi ^ oldHi) >>> 0;
    xsLo = (xsLo ^ oldLo) >>> 0;
    const xorshifted = ((xsLo >>> 27) | (xsHi << 5)) >>> 0;
    const rot = oldHi >>> 27;
    const rot2 = ((-rot >>> 0) & 31) >>> 0;
    return ((xorshifted >>> rot) | (xorshifted << rot2)) >>> 0;
  }

  float(): number {
    // This could be improved. See <https://www.pcg-random.org/using-pcg-c-basic.html#generating-doubles>
    return this.next32() / 2 ** 32;
  }
}

// pcg32_random()
// pcg32_random_r(rng)
//     Generate a uniformly distributed 32-bit random number

// pcg32_boundedrand(bound):
// pcg32_boundedrand_r(rng, bound):
//     Generate a uniformly distributed number, r, where 0 <= r < bound

// uint32_t pcg32_boundedrand_r(pcg32_random_t* rng, uint32_t bound)
// {
// To avoid bias, we need to make the range of the RNG a multiple of
// bound, which we do by dropping output less than a threshold.
// A naive scheme to calculate the threshold would be to do
//
//     uint32_t threshold = 0x100000000ull % bound;
//
// but 64-bit div/mod is slower than 32-bit div/mod (especially on
// 32-bit platforms).  In essence, we do
//
//     uint32_t threshold = (0x100000000ull-bound) % bound;
//
// because this version will calculate the same modulus, but the LHS
// value is less than 2^32.

// uint32_t threshold = -bound % bound;

// Uniformity guarantees that this loop will terminate.  In practice, it
// should usually terminate quickly; on average (assuming all bounds are
// equally likely), 82.25% of the time, we can expect it to require just
// one iteration.  In the worst case, someone passes a bound of 2^31 + 1
// (i.e., 2147483649), which invalidates almost 50% of the range.  In
// practice, bounds are typically small and only a tiny amount of the range
// is eliminated.
//     for (;;) {
//         uint32_t r = pcg32_random_r(rng);
//         if (r >= threshold)
//             return r % bound;
//     }
// }

function mul64(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number
): [number, number] {
  const aL = aLo >>> 0,
    aH = aHi >>> 0;
  const bL = bLo >>> 0,
    bH = bHi >>> 0;

  const aLH = (aL >>> 16) & 0xffff,
    aLL = aL & 0xffff;
  const bLH = (bL >>> 16) & 0xffff,
    bLL = bL & 0xffff;

  // no need for imul, these are 16 bits so it can't overflow
  const aLHxbLL = (aLH * bLL) >>> 0,
    aLLxbLH = (aLL * bLH) >>> 0;
  const aLHxbLH = (aLH * bLH) >>> 0,
    aLLxbLL = (aLL * bLL) >>> 0;

  const aLHxbLL0 = aLHxbLL >>> 16,
    aLHxbLL1 = (aLHxbLL << 16) >>> 0;
  const aLLxbLH0 = aLLxbLH >>> 16,
    aLLxbLH1 = (aLLxbLH << 16) >>> 0;

  const l0 = (aLHxbLL1 + aLLxbLH1) >>> 0;
  const c0 = Number(l0 >>> 0 < aLHxbLL1 >>> 0) | 0;
  const h0 = (((aLHxbLL0 + aLLxbLH0) >>> 0) + c0) >>> 0;

  const aLxbH = Math.imul(aL, bH) >>> 0;
  const aHxbL = Math.imul(aH, bL) >>> 0;

  const resLo = (l0 + aLLxbLL) >>> 0;
  const c1 = Number(resLo >>> 0 < aLLxbLL >>> 0) | 0;
  const h1 = (((aLHxbLH + h0) >>> 0) + c1) >>> 0;

  const resHi = (((aLxbH + aHxbL) >>> 0) + h1) >>> 0;

  return [resLo, resHi];
}

function add64(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number
): [number, number] {
  const aL = aLo >>> 0,
    aH = aHi >>> 0;
  const bL = bLo >>> 0,
    bH = bHi >>> 0;
  const aHpbH = (aH + bH) >>> 0;
  const lo = (aL + bL) >>> 0;
  const carry = Number(lo < aL) >>> 0;
  const hi = (aHpbH + carry) >>> 0;
  return [lo, hi];
}
