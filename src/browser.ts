import assert from "node:assert/strict";

import { BrowserContext, chromium, firefox, webkit } from "playwright";

import { Logger } from "./logging.js";
import { BrowserType, LaunchArgs, Path, RunConfig } from "./types.js";

const browserTypeMapping = {
  [BrowserType.Brave]: chromium,
  [BrowserType.Chromium]: chromium,
  [BrowserType.Gecko]: firefox,
  [BrowserType.WebKit]: webkit,
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

const launchArgsEmpty = (): string[] => {
  return [];
};

const launchArgsForConfig = (config: RunConfig): LaunchArgs => {
  let launchArgsFunc;

  switch (config.browser) {
    case BrowserType.Brave:
      launchArgsFunc = launchArgsForBrave;
      break;
    case BrowserType.Chromium:
      launchArgsFunc = launchArgsForChromium;
      break;
    case BrowserType.Gecko:
      launchArgsFunc = launchArgsEmpty;
      break;
    case BrowserType.WebKit:
      launchArgsFunc = launchArgsEmpty;
      break;
  }
  assert(launchArgsFunc);
  const browserArgs = launchArgsFunc(config);

  const defaultBrowserArgs: string[] = [];
  const launchArgs: LaunchArgs = {
    args: defaultBrowserArgs.concat(browserArgs),
    executablePath: config.binary,
    screen: {
      height: config.viewport.height,
      width: config.viewport.width,
    },
    serviceWorkers: "allow",
    timeout: config.timeout * 1000,
    headless: false,
  };

  return launchArgs;
};

const getContext = async (
  browser: BrowserType,
  userDataDir: Path,
  launchArgs: LaunchArgs,
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
  logger.info("Launching browser with arguments: ", launchArgs);
  return await getContext(browserType, userDataDir, launchArgs);
};
