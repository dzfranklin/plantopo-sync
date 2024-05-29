import { PlatformClockSource } from "./platform/PlatformClockSource.ts";

export const Clock = {
  /** Returns the current time in unix milliseconds */
  now(): number {
    return global.now();
  },

  /** Schedule a callback to be called after a delay in milliseconds */
  timeout(cb: () => void, delay: number): number {
    return global.timeout(cb, delay);
  },

  cancelTimeout(timeout: number): void {
    global.cancelTimeout(timeout);
  },

  wait(ms: number): Promise<void> {
    return new Promise((resolve) => global.timeout(resolve, ms));
  },

  /** Schedule a callback to be called every interval milliseconds */
  interval(cb: () => void, interval: number): number {
    return global.interval(cb, interval);
  },

  cancelInterval(interval: number): void {
    global.cancelInterval(interval);
  },

  __debugGetGlobal(): ClockSource {
    return global;
  },

  __debugSetGlobal(clock: ClockSource) {
    global = clock;
  },
};

let global: ClockSource = PlatformClockSource;

export interface ClockSource {
  now(): number;
  timeout(cb: () => void, delay: number): number;
  cancelTimeout(timeout: number): void;
  interval(cb: () => void, interval: number): number;
  cancelInterval(interval: number): void;
}
