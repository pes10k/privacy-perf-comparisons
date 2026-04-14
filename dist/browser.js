import { chromium, firefox, webkit } from "@playwright/test";
import { BrowserType } from "./types.js";
const launchOptionsDefault = (config) => {
    // We implement *not* preserving tabs and pages that are open in the user
    // browser state by
    // 1. launching the browser in offline mode
    // 2. closing any tabs and pages that are opened by the existing
    //    user-data-dir/profile state
    // 3. and then, enabling networking.
    const startInOfflineMode = !config.preservePages;
    return {
        args: [],
        executablePath: config.binary,
        headless: false,
        offline: startInOfflineMode,
        viewport: {
            height: config.viewport.height,
            width: config.viewport.width,
        },
        serviceWorkers: "block",
        timeout: config.timeout * 1000,
    };
};
const launchOptionsBrave = (config) => {
    const options = launchOptionsChromium(config);
    options.args.push("--disable-brave-update");
    options.args.push("--disable-sync");
    return options;
};
const launchOptionsChromium = (config) => {
    const options = launchOptionsDefault(config);
    options.args.push("--disable-features=MacAppCodeSignClone");
    if (config.profile) {
        options.args.push(`--profile-directory="${config.profile}`);
    }
    return options;
};
const launchOptionsGecko = (config) => {
    return launchOptionsDefault(config);
};
const launchOptionsWebKit = (config) => {
    return launchOptionsDefault(config);
};
const browserTypeConfigMapping = {
    [BrowserType.Brave]: {
        type: chromium,
        options: launchOptionsBrave,
    },
    [BrowserType.Chromium]: {
        type: chromium,
        options: launchOptionsChromium,
    },
    [BrowserType.Gecko]: {
        type: firefox,
        options: launchOptionsGecko,
    },
    [BrowserType.WebKit]: {
        type: webkit,
        options: launchOptionsWebKit,
    },
};
export const launch = async (logger, config) => {
    const paramsForBrowser = browserTypeConfigMapping[config.browser];
    const launchOptionsForConfigFunc = paramsForBrowser.options;
    const opts = launchOptionsForConfigFunc(config);
    const browser = paramsForBrowser.type;
    const userDataDir = config.userDataDir;
    logger.info("Launching with options: ", { ...opts, userDataDir });
    const context = await browser.launchPersistentContext(userDataDir, opts);
    return context;
};
//# sourceMappingURL=browser.js.map