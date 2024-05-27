import { RandomSource } from "../Random/mod.ts";

export const PlatformRandomSource: RandomSource = {
  next32() {
    return (Math.random() * 0xffffffff) >>> 0;
  },

  float() {
    return Math.random();
  },
};
