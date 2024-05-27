import { ConsoleLogger, Logger, NoopLogger } from "./Logger.ts";
import { __debugWithGlobalRng } from "./Random/mod.ts";

export function testLogger(): Logger {
  return new ConsoleLogger();
}

export function noopLogger(): Logger {
  return new NoopLogger();
}

export function withZeroRng<T>(fn: () => T): T {
  return __debugWithGlobalRng({ next32: () => 0, float: () => 0 }, fn);
}
