import { Writable } from "node:stream";

import { LaunchOptions } from "playwright";

import { LoggingLevel } from "./logging.js";

export type Path = string;
export type Serializable = unknown;
export type VersionNumber = string;
export type WSFrame = string | Buffer;

export interface PersistentLaunchOptions extends LaunchOptions {
  args: string[];
  offline: boolean;
  viewport: {
    height: number;
    width: number;
  };
  serviceWorkers: "allow" | "block";
}

export enum BrowserType {
  Brave = "brave",
  Chromium = "chromium",
  Gecko = "gecko",
  WebKit = "webkit",
}

export enum MeasurementType {
  MemoryCPU = "memory-cpu",
  Network = "network",
  Timing = "timing",
}

export interface Report {
  url: URL;
  start: Date;
  end: Date;
  version: VersionNumber;
  measurements: Record<MeasurementType, unknown>;
}

export interface RunConfig {
  args?: string[];
  binary: Path;
  browser: BrowserType;
  loggingLevel: LoggingLevel;
  measurements: MeasurementType[];
  output: Writable;
  preservePages: boolean;
  profile?: string;
  seconds: number;
  timeout: number;
  url: URL;
  userDataDir: Path;
  viewport: {
    height: number;
    width: number;
  };
}
