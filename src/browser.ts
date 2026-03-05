import assert from "node:assert/strict";

import { BrowserContext, chromium, firefox, webkit } from "@playwright/test";

import { Logger } from "./logging.js";
import {
  BrowserType,
  PersistentLaunchOptions,
  Path,
  RunConfig,
} from "./types.js";

const browserTypeMapping = {
  [BrowserType.Brave]: chromium,
  [BrowserType.Chromium]: chromium,
  [BrowserType.Gecko]: firefox,
  [BrowserType.WebKit]: webkit,
};

const launchArgsEmpty = (): string[] => {
  return [];
};

const launchArgsForBrave = (config: RunConfig): string[] => {
  const launchArgs = launchArgsForChromium(config);
  launchArgs.push("--disable-brave-update");
  launchArgs.push("--disable-sync");
  return launchArgs;
};

const launchArgsForChromium = (config: RunConfig): string[] => {
  const launchArgs = ["--disable-features=MacAppCodeSignClone"];
  if (config.profile) {
    launchArgs.push(`--profile-directory="${config.profile}`);
  }
  return launchArgs;
};

const launchArgsForGecko = (): string[] => {
  return launchArgsEmpty();
};

const launchArgsForConfig = (config: RunConfig): PersistentLaunchOptions => {
  let launchArgsFunc;

  switch (config.browser) {
    case BrowserType.Brave:
      launchArgsFunc = launchArgsForBrave;
      break;
    case BrowserType.Chromium:
      launchArgsFunc = launchArgsForChromium;
      break;
    case BrowserType.Gecko:
      launchArgsFunc = launchArgsForGecko;
      break;
    case BrowserType.WebKit:
      launchArgsFunc = launchArgsEmpty;
      break;
  }
  assert(launchArgsFunc);
  const browserArgs = launchArgsFunc(config);

  const defaultBrowserArgs: string[] = [];
  const launchOptions: PersistentLaunchOptions = {
    args: defaultBrowserArgs.concat(browserArgs),
    executablePath: config.binary,
    screen: {
      height: config.viewport.height,
      width: config.viewport.width,
    },
    serviceWorkers: "block",
    timeout: config.timeout * 1000,
    headless: false,
  };

  return launchOptions;
};

const getContext = async (
  browser: BrowserType,
  userDataDir: Path,
  launchArgs: PersistentLaunchOptions,
): Promise<BrowserContext> => {
  const browserType = browserTypeMapping[browser];
  assert(browserType);
  return await browserType.launchPersistentContext(userDataDir, launchArgs);
};

export const launch = async (
  logger: Logger,
  config: RunConfig,
): Promise<BrowserContext> => {
  const browserType = config.browser;
  const userDataDir = config.userDataDir;
  const launchArgs = launchArgsForConfig(config);
  logger.info("Launching browser with args: ", { ...launchArgs, userDataDir });
  return await getContext(browserType, userDataDir, launchArgs);
};
