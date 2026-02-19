import { LoggingLevel } from "./logging.js";

export type Path = string;
export type WSFrame = string | Buffer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LaunchArgs = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Serializable = any;

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
  logLevel: LoggingLevel;
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
