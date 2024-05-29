import { jsonFormatter } from "std/log/formatters.ts";
import { BaseHandler } from "std/log/base_handler.ts";

export class LogHandler extends BaseHandler {
  override formatter = jsonFormatter;

  override log(msg: string): void {
    try {
      console.log(JSON.stringify({ type: "log", log: JSON.parse(msg) }));
    } catch (err) {}
  }
}
