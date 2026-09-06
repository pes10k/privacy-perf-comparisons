import { Writable } from "node:stream";

import { LaunchOptions } from "playwright";

import { LoggingLevel } from "./logging.js";

export type Path = string;
export type Serializable = unknown;
export type VersionNumber = string;
export type WSFrame = string | Buffer;
export type ChromiumArg = string;
export type FirefoxUserPrefs = Record<string, string | number | boolean>;

export interface PersistentLaunchOptions extends LaunchOptions {
  args: string[];
  offline: boolean;
  viewport: {
    height: number;
    width: number;
  };
  serviceWorkers: "allow" | "block";
}

export interface WebkitBuildPaths {
  rootDir: Path;
  binary: Path;
  releaseDir: Path;
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
  Power = "power",
  Timing = "timing",
}

export interface Report {
  url: URL;
  start: Date;
  end: Date;
  version: VersionNumber;
  measurements: Partial<Record<MeasurementType, unknown>>;
}

export interface RunConfig {
  chromiumArgs?: ChromiumArg[];
  binary: Path;
  browser: BrowserType;
  firefoxUserPrefs?: FirefoxUserPrefs;
  isUsingPlaywrightBinary: boolean;
  loggingLevel: LoggingLevel;
  measurements: MeasurementType[];
  output: Writable;
  preservePages: boolean;
  seconds: number;
  shouldDropPermissions: boolean;
  timeout: number;
  url: URL;
  userDataDir: Path;
  viewport: {
    height: number;
    width: number;
  };
  webkitBuildPaths?: WebkitBuildPaths;
}
