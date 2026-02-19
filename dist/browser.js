import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { BrowserType } from './types.js';
const browserTypeMapping = {
    [BrowserType.Brave]: chromium,
    [BrowserType.Chromium]: chromium,
    [BrowserType.Gecko]: firefox,
    [BrowserType.WebKit]: webkit,
};
const launchArgsForBrave = (config) => {
    const launchArgs = launchArgsForChromium(config);
    launchArgs.push('--disable-brave-update');
    launchArgs.push('--disable-sync');
    return launchArgs;
};
const launchArgsForChromium = (config) => {
    const launchArgs = [
        '--disable-features=MacAppCodeSignClone',
    ];
    if (config.profile) {
        launchArgs.push(`--profile-directory="${config.profile}`);
    }
    return launchArgs;
};
const launchArgsEmpty = () => {
    return [];
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
            launchArgsFunc = launchArgsEmpty;
            break;
        case BrowserType.WebKit:
            launchArgsFunc = launchArgsEmpty;
            break;
    }
    assert(launchArgsFunc);
    const browserArgs = launchArgsFunc(config);
    const defaultBrowserArgs = [];
    const launchArgs = {
        args: defaultBrowserArgs.concat(browserArgs),
        executablePath: config.binary,
        screen: {
            height: config.viewport.height,
            width: config.viewport.width,
        },
        serviceWorkers: 'allow',
        timeout: config.timeout,
    };
    return launchArgs;
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
    logger.info('Launching browser with arguments: ', launchArgs);
    return await getContext(browserType, userDataDir, launchArgs);
};
