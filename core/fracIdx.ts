import { Rng } from "./Rng.ts";

const MIN_DIGIT = " ".charCodeAt(0);
const MAX_DIGIT = "~".charCodeAt(0);
const MAX_JITTER = 0x100;

export function isFracIdx(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < MIN_DIGIT || code > MAX_DIGIT) return false;
  }
  return true;
}

// From <https://madebyevan.com/algos/crdt-fractional-indexing/>
export function fracIdxBetween(
  rng: Rng,
  before: string,
  after: string
): string {
  let foundDifference = false;
  let result = "";
  let i = 0;

  // Note: There are many ways to pick a fraction between two other
  // fractions. The code below is just one way to do it, but it's
  // certainly not the only way. Feel free to do this differently if
  // you'd like.
  while (true) {
    // Pretend all digits past the end of the "before" position are
    // "0" (our minimum digit).
    const digitBefore = i < before.length ? before.charCodeAt(i) : MIN_DIGIT;

    // Pretend all digits past the end of the "after" position are
    // "10" (one past our maximum digit). We do this because generated
    // digits must be less than this number and we want to be able to
    // generate "maxDigit" at the end of a generated position.
    const digitAfter =
      !foundDifference && i < after.length
        ? after.charCodeAt(i)
        : MAX_DIGIT + 1;

    // Try to split the difference at the halfway point. This will round down,
    // and only the upper value is ever equal to "maxDigit + 1", so the halfway
    // point will always be less than or equal to "maxDigit".
    const pick = (digitBefore + digitAfter) >>> 1;
    result += String.fromCharCode(pick);

    // If the difference is too small, continue to the next digit. We don't
    // need to test the upper number since the division by two always rounds
    // down. So if it's greater than the lower bound, then it must therefore
    // also be less than the upper bound.
    if (pick <= digitBefore) {
      // If the rounded halfway point is equal to the "before" digit but the
      // "before" and "after" digits are different, then the difference between
      // them must be 1. In that case we want to treat all remaining "after"
      // digits as larger than the maximum digit value since we have reached the
      // end of the common shared prefix.
      //
      // For example, for "0.19" and "0.23" we won't be able to generate a digit
      // in between "1" and "2" so we need to continue to the next digit pair,
      // but we don't want to try to average "9" and "3" to get a digit since
      // the next digit must be greater than or equal to "9". So instead we want
      // to average "9" and a value greater than the maximum digit (i.e. "10").
      if (digitBefore < digitAfter) {
        foundDifference = true;
      }

      i += 1;
      continue;
    }

    // Otherwise, return the halfway point plus random jitter to avoid
    // collisions in the case where two peers try to concurrently insert
    // between the same positions.
    //
    // The random jitter is added as random extra digits past the end of the
    // fraction. This will never push the generated position past "next"
    // because we know that "pick" is already less than "next". For example,
    // "0.014abc" is always less than "0.015xyz" for all "abc" and "xyz".
    // This implementation avoids unnecessarily append trailing "0" digits
    // to the end.
    //
    // Note that the fact that the random jitter is always a non-negative
    // number will bias the result slightly. This doesn't matter when we
    // use a large base so the bias is small. The bias only really matters
    // for smaller bases such as base 2.
    let jitter = Math.floor(rng.random() * MAX_JITTER);
    while (jitter > 0) {
      const base = MAX_DIGIT - MIN_DIGIT + 1;
      const mod = jitter % base;
      jitter = (jitter - mod) / base;
      result += String.fromCharCode(MIN_DIGIT + mod);
    }
    return result;
  }
}
