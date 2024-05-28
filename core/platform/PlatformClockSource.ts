import { ClockSource } from "../Clock.ts";

export const PlatformClockSource: ClockSource = {
  now(): number {
    return Date.now();
  },

  timeout(cb: () => void, delay: number): number {
    return setTimeout(cb, delay);
  },

  cancelTimeout(timeout: number): void {
    clearTimeout(timeout);
  },

  interval(cb: () => void, interval: number): number {
    return setInterval(cb, interval);
  },

  cancelInterval(interval: number): void {
    clearInterval(interval);
  },
};
