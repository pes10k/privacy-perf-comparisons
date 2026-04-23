import { BrowserContext, chromium, firefox, webkit } from "@playwright/test";
import { BrowserType as PlaywrightBrowserType } from "@playwright/test";

import { Logger } from "./logging.js";
import { BrowserType, PersistentLaunchOptions, RunConfig } from "./types.js";

type BrowserOptionsFunc = (config: RunConfig) => PersistentLaunchOptions;
interface BrowserLaunchParams {
  type: PlaywrightBrowserType;
  options: BrowserOptionsFunc;
}
type BrowserTypeMapping = Record<BrowserType, BrowserLaunchParams>;

const launchOptionsDefault = (config: RunConfig): PersistentLaunchOptions => {
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

// const playwrightChromeArgs = [
//   "--disable-field-trial-config", // https://source.chromium.org/chromium/chromium/src/+/main:testing/variations/README.md
//   "--disable-backgrounding-occluded-windows",
//   "--disable-back-forward-cache", // Avoids surprises like main request not being intercepted during page.goBack().
//   "--disable-breakpad",
//   "--disable-client-side-phishing-detection",
//   "--disable-component-extensions-with-background-pages",
//   "--disable-component-update", // Avoids unneeded network activity after startup.
//   "--no-default-browser-check",
//   "--disable-default-apps",
//   "--disable-dev-shm-usage",
//   "--disable-edgeupdater", // Disables Edge-specific updater on mac.
//   // '--disable-features=' + disabledFeatures.join(','),
//   // process.env.PLAYWRIGHT_LEGACY_SCREENSHOT ? '' : '--enable-features=CDPScreenshotNewSurface',
//   "--allow-pre-commit-input",
//   "--disable-hang-monitor",
//   "--disable-ipc-flooding-protection",
//   "--disable-popup-blocking",
//   "--disable-prompt-on-repost",
//   "--disable-renderer-backgrounding",
//   "--force-color-profile=srgb",
//   "--metrics-recording-only",
//   "--no-first-run",
//   "--password-store=basic",
//   "--use-mock-keychain",
//   // See https://chromium-review.googlesource.com/c/chromium/src/+/2436773
//   "--no-service-autorun",
//   "--export-tagged-pdf",
//   // https://chromium-review.googlesource.com/c/chromium/src/+/4853540
//   "--disable-search-engine-choice-screen",
//   // https://issues.chromium.org/41491762
//   "--unsafely-disable-devtools-self-xss-warnings",
//   // Edge can potentially restart on Windows (msRelaunchNoCompatLayer) which looses its file descriptors (stdout/stderr) and CDP (3/4). Disable until fixed upstream.
//   "--edge-skip-compat-layer-relaunch",
//   // This disables Chrome for Testing infobar that is visible in the persistent context.
//   // The switch is ignored everywhere else, including Chromium/Chrome/Edge.
//   "--disable-infobars",
//   // Less annoying popups.
//   "--disable-search-engine-choice-screen",
//   // Prevents the "three dots" menu crash in IdentityManager::HasPrimaryAccount for ephemeral contexts.
//   "--disable-sync",
// ];

const launchOptionsBrave = (config: RunConfig): PersistentLaunchOptions => {
  const options = launchOptionsChromium(config);
  options.args.push("--disable-brave-update");
  return options;
};

// Taken from
// https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromiumSwitches.ts#L51
const playwrightDisabledFeatures = [
  // See https://github.com/microsoft/playwright/issues/14047
  "AvoidUnnecessaryBeforeUnloadCheckSync",
  // See https://github.com/microsoft/playwright/issues/38568
  "BoundaryEventDispatchTracksNodeRemoval",
  "DestroyProfileOnBrowserClose",
  // See https://github.com/microsoft/playwright/pull/13854
  "DialMediaRouteProvider",
  "GlobalMediaControls",
  // See https://github.com/microsoft/playwright/pull/27605
  "HttpsUpgrades",
  // Hides the Lens feature in the URL address bar. Its not working in unofficial builds.
  "LensOverlay",
  // See https://github.com/microsoft/playwright/pull/8162
  "MediaRouter",
  // See https://github.com/microsoft/playwright/issues/28023
  "PaintHolding",
  // See https://github.com/microsoft/playwright/issues/32230
  "ThirdPartyStoragePartitioning",
  // See https://github.com/microsoft/playwright/issues/16126
  "Translate",
  // See https://issues.chromium.org/u/1/issues/435410220
  "AutoDeElevate",
  // See https://github.com/microsoft/playwright/issues/37714
  "RenderDocument",
  // Prevents downloading optimization hints on startup.
  "OptimizationHints",
  "CDPScreenshotNewSurface",
];

const launchOptionsChromium = (config: RunConfig): PersistentLaunchOptions => {
  const options = launchOptionsDefault(config);
  options.args.push("--disable-features=MacAppCodeSignClone");
  options.args.push("--enable-features=HttpsUpgrades");
  options.ignoreDefaultArgs = [
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-extensions",
    "--disable-features=" + playwrightDisabledFeatures.join(","),
  ];
  if (config.args) {
    for (const anArg of config.args) {
      options.args.push(anArg);
    }
  }
  return options;
};

const launchOptionsGecko = (config: RunConfig): PersistentLaunchOptions => {
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

const launchOptionsWebKit = (config: RunConfig): PersistentLaunchOptions => {
  return launchOptionsDefault(config);
};

const browserTypeConfigMapping: BrowserTypeMapping = {
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

export const launch = async (
  logger: Logger,
  config: RunConfig,
): Promise<BrowserContext> => {
  const paramsForBrowser = browserTypeConfigMapping[config.browser];

  const launchOptionsForConfigFunc = paramsForBrowser.options;
  const opts = launchOptionsForConfigFunc(config);

  const browser = paramsForBrowser.type;
  const userDataDir = config.userDataDir;
  logger.info("Launching with options: ", { ...opts, userDataDir });
  const context = await browser.launchPersistentContext(userDataDir, opts);
  logger.info("...and launched.");
  return context;
};
