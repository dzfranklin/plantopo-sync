interface Resolver<T> {
  resolve: (msg: T) => void;
  reject: (err: unknown) => void;
}

export default class Channel<T> {
  private _queue: T[] = [];
  private _waiters: Resolver<T>[] = [];

  send(msg: T): void {
    if (this._waiters.length > 0) {
      this._waiters.shift()!.resolve(msg);
    } else {
      this._queue.push(msg);
    }
  }

  recv(): Promise<T> {
    if (this._queue.length > 0) {
      return Promise.resolve(this._queue.shift()!);
    } else {
      return new Promise<T>((resolve, reject) => {
        this._waiters.push({ resolve, reject });
      });
    }
  }

  recvTimeout(timeoutMs: number): Promise<T | undefined> {
    if (this._queue.length > 0) {
      return Promise.resolve(this._queue.shift()!);
    } else {
      return new Promise<T | undefined>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(undefined);

          const i = this._waiters.findIndex((w) => w.reject === reject);
          if (i !== -1) {
            this._waiters.splice(i, 1);
          }
        }, timeoutMs);
        this._waiters.push({
          resolve: (msg) => {
            clearTimeout(timeout);
            resolve(msg);
          },
          reject,
        });
      });
    }
  }
}
