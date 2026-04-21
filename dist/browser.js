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
        args: config.args ?? [],
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
    // Playwright sets a *lot* of chromium flags by default. We don't want
    // all of them. See:
    // https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromiumSwitches.ts
    options.args.push("--disable-features=MacAppCodeSignClone");
    if (config.profile) {
        options.args.push(`--profile-directory="${config.profile}"`);
    }
    options.chromiumSandbox = false;
    return options;
};
const launchOptionsGecko = (config) => {
    const options = launchOptionsDefault(config);
    // Undo some of the changes Playwright makes to default Firefox behavior,
    // see:
    // https://github.com/microsoft/playwright/blob/main/browser_patches/firefox/preferences/playwright.cfg
    options.firefoxUserPrefs = {
        "fission.webContentIsolationStrategy": 1,
        "fission.bfcacheInParent": true,
        "network.cookie.CHIPS.enabled": true,
        "dom.ipc.processCount": 8,
        "dom.ipc.processPrelaunch.enabled": true,
        "permissions.isolateBy.userContext": false,
        "dom.file.createInChild": false,
        "dom.disable_open_during_load": true,
        "webgl.forbid-software": true,
        "browser.safebrowsing.blockedURIs.enabled": false,
        "browser.safebrowsing.downloads.enabled": false,
        "browser.safebrowsing.passwords.enabled": false,
        "browser.safebrowsing.malware.enabled": false,
        "browser.safebrowsing.phishing.enabled": false,
        "privacy.trackingprotection.enabled": false,
    };
    if (config.firefoxUserPrefs) {
        for (const [key, value] of Object.entries(config.firefoxUserPrefs)) {
            options.firefoxUserPrefs[key] = value;
        }
    }
    return options;
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