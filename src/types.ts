import { LaunchOptions } from "playwright";

import { LoggingLevel } from "./logging.js";

export type Path = string;
export type WSFrame = string | Buffer;
export type Serializable = unknown;

export interface PersistentLaunchOptions extends LaunchOptions {
  serviceWorkers?: "allow" | "block";
  screen?: {
    height: number;
    width: number;
  };
}

export enum BrowserType {
  Brave = "brave",
  Chromium = "chromium",
  Gecko = "gecko",
  WebKit = "webkit",
}

export enum MeasurementType {
  Network = "network",
  Timing = "timing",
}

export interface Report {
  url: URL;
  start: Date;
  end: Date;
  measurements: Record<MeasurementType, unknown>;
}

export interface RunConfig {
  binary: Path;
  browser: BrowserType;
  loggingLevel: LoggingLevel;
  measurements: MeasurementType[];
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
