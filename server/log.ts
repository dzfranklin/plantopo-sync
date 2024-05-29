import { debug, info, warn, error, critical, setup } from "std/log/mod.ts";
import { Logger as ILogger } from "../core/index.ts";

export class DenoLogger implements ILogger {
  constructor(private readonly props: Record<string, unknown>) {}

  debug(msg: string, props?: Record<string, unknown>): void {
    debug(msg, { ...this.props, ...props });
  }
  info(msg: string, props?: Record<string, unknown>): void {
    info(msg, { ...this.props, ...props });
  }
  warn(msg: string, props?: Record<string, unknown>): void {
    warn(msg, { ...this.props, ...props });
  }
  error(msg: string, props?: Record<string, unknown>): void {
    error(msg, { ...this.props, ...props });
  }
  child(props: Record<string, unknown>): ILogger {
    return new DenoLogger({ ...this.props, ...props });
  }
}

export const Logger = new DenoLogger({});

export { debug, info, warn, error, critical, setup };
