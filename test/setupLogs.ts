import { LogHandler } from "./LogHandler.ts";
import * as log from "std/log/mod.ts";
import { DenoLogger } from "../server/log.ts";

export function logLevelFromEnv() {
  const logLevel = Deno.env.get("LOG_LEVEL")?.toUpperCase() || "INFO";
  if (
    logLevel !== "DEBUG" &&
    logLevel !== "INFO" &&
    logLevel !== "WARN" &&
    logLevel !== "ERROR" &&
    logLevel !== "CRITICAL"
  ) {
    throw new Error("Invalid log level");
  }
  return logLevel;
}

export function setupLogs() {
  const level = logLevelFromEnv();
  log.setup({
    handlers: {
      default: new LogHandler(level),
    },
    loggers: {
      default: {
        level,
        handlers: ["default"],
      },
    },
  });
}

export const logger = new DenoLogger({});
