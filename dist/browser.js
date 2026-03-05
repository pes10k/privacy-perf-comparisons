import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "@playwright/test";
import { BrowserType, } from "./types.js";
const browserTypeMapping = {
    [BrowserType.Brave]: chromium,
    [BrowserType.Chromium]: chromium,
    [BrowserType.Gecko]: firefox,
    [BrowserType.WebKit]: webkit,
};
const launchArgsEmpty = () => {
    return [];
};
const launchArgsForBrave = (config) => {
    const launchArgs = launchArgsForChromium(config);
    launchArgs.push("--disable-brave-update");
    launchArgs.push("--disable-sync");
    return launchArgs;
};
const launchArgsForChromium = (config) => {
    const launchArgs = ["--disable-features=MacAppCodeSignClone"];
    if (config.profile) {
        launchArgs.push(`--profile-directory="${config.profile}`);
    }
    return launchArgs;
};
const launchArgsForGecko = () => {
    return launchArgsEmpty();
};
const launchArgsForConfig = (config) => {
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
    const defaultBrowserArgs = [];
    const launchOptions = {
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
const getContext = async (browser, userDataDir, launchArgs) => {
    const browserType = browserTypeMapping[browser];
    assert(browserType);
    return await browserType.launchPersistentContext(userDataDir, launchArgs);
};
export const launch = async (logger, config) => {
    const browserType = config.browser;
    const userDataDir = config.userDataDir;
    const launchArgs = launchArgsForConfig(config);
    logger.info("Launching browser with args: ", { ...launchArgs, userDataDir });
    return await getContext(browserType, userDataDir, launchArgs);
};
//# sourceMappingURL=browser.js.map