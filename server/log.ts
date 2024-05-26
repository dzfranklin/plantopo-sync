import { debug, info, warn, error, critical, setup } from "std/log/mod.ts";
import { Logger as ILogger } from "../core/index.ts";

class DenoLogger implements ILogger {
  constructor(private readonly props: Record<string, unknown>) {}

  debug(msg: string, props?: Record<string, unknown>): void {
    debug(msg, props);
  }
  info(msg: string, props?: Record<string, unknown>): void {
    info(msg, props);
  }
  warn(msg: string, props?: Record<string, unknown>): void {
    warn(msg, props);
  }
  error(msg: string, props?: Record<string, unknown>): void {
    error(msg, props);
  }
  child(props: Record<string, unknown>): ILogger {
    return new DenoLogger({ ...this.props, ...props });
  }
}

export const Logger = new DenoLogger({});

export { debug, info, warn, error, critical, setup };
