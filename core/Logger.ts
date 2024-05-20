type Props = Record<string, unknown>;

export interface Logger {
  debug(msg: string, props?: Props): void;
  info(msg: string, props?: Props): void;
  warn(msg: string, props?: Props): void;
  error(msg: string, props?: Props): void;
  child(props: Props): Logger;
}

export class ConsoleLogger implements Logger {
  constructor(private readonly props: Props | null = null) {}

  debug(msg: string, props: Props = {}) {
    console.debug("DEBUG", msg, { ...this.props, ...props });
  }

  info(msg: string, props: Props = {}) {
    console.info("INFO", msg, { ...this.props, ...props });
  }

  warn(msg: string, props: Props = {}) {
    console.warn("WARN", msg, { ...this.props, ...props });
  }

  error(msg: string, props: Props = {}) {
    console.error("ERROR", msg, { ...this.props, ...props });
  }

  child(props: Props): Logger {
    return new ConsoleLogger({ ...this.props, ...props });
  }
}

export class NoopLogger implements Logger {
  debug() {}
  info() {}
  warn() {}
  error() {}
  child(): Logger {
    return this;
  }
}
