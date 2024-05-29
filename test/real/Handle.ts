import { TextLineStream } from "jsr:@std/streams@0.223.0/text-line-stream";
import { inspectServer } from "./main.ts";
import { logLevelFromEnv } from "../setupLogs.ts";

export class Handle {
  static enc = new TextEncoder();
  static dec = new TextDecoder();

  private _p: Deno.ChildProcess;
  private _in: WritableStreamDefaultWriter<Uint8Array>;
  public out: ReadableStream<{ line: string; handle: [string, number] }>;

  constructor(public name: string, public id: number, public args: string[]) {
    const cmd = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-all",
        "--unstable-kv",
        ...(inspectServer && name === "server.ts" ? ["--inspect-brk"] : []),
        this.name,
        ...this.args,
      ],
      env: {
        LOG_LEVEL: logLevelFromEnv(),
      },
      stdin: "piped",
      stdout: "piped",
      cwd: import.meta.dirname,
    });
    this._p = cmd.spawn();
    this.out = this._p.stdout
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeThrough(
        new TransformStream({
          transform: (data, controller) => {
            controller.enqueue({
              line: data,
              handle: [this.name, this.id],
            });
          },
        })
      );
    this._in = this._p.stdin.getWriter();

    Deno.addSignalListener("SIGINT", () => {
      this.kill();
    });
  }

  async send(data: unknown) {
    if (this._p === null) {
      throw new Error("Process not started");
    }
    await this._in.write(Handle.enc.encode(JSON.stringify(data) + "\n"));
  }

  async kill() {
    this._p.kill();
  }
}
