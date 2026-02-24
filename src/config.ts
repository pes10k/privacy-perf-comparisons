import assert from "node:assert/strict";
import { access, constants, mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Namespace } from "argparse";
import { chromium, firefox, webkit } from "playwright";

import { BrowserType, MeasurementType, Path, RunConfig } from "./types.js";
import { LoggingLevel } from "./logging.js";

const programName = "privacy-perf-comparisons";
const validSchemes = ["http:", "https:"];

const isPathToExecFile = async (path: Path): Promise<boolean> => {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const isDirReadable = async (...pathSegments: Path[]): Promise<boolean> => {
  try {
    await access(join(...pathSegments), constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

export const runConfigForArgs = async (args: Namespace): Promise<RunConfig> => {
  assert(args.url instanceof URL);
  if (!validSchemes.includes(args.url.protocol)) {
    throw new Error(
      "Invalid URL. Must contain a http(s) scheme and hostname. Received " +
        `scheme "${args.url.protocol}"`,
    );
  }

  if (!args.url.hostname) {
    throw new Error(
      "Invalid URL. Must contain a hostname. Received " +
        `hostname "${args.url.hostname}"`,
    );
  }

  if (args.seconds <= 0) {
    throw new Error('Invalid "seconds". Must be a positive integer.');
  }

  const isChromium =
    args.browser === BrowserType.Chromium || args.browser === BrowserType.Brave;

  assert(typeof args.profile === "string");
  assert(typeof args.userDataDir === "string");
  if (args.profile && !isChromium) {
    throw new Error(
      "Invalid profile. Only Chromium browsers support " +
        "multiple profiles in a single user data dir.",
    );
  }

  // Here we check that one of the following conditions are true:
  // 1. the user didn't specify a user-data-dir (in which case we create
  //    a temporary one).
  // 2. the user specified a user-data-dir, and that path is empty (in which
  //    case we rely on the browser to create a new user data dir at the given
  //    path),
  // 3. the user specified
  //    i. NOT chromium AND
  //    ii. the user-data-dir exists
  //      (in which case we use the user-data-dir as the profile directory
  //      itself).
  // 4. the user specified
  //    i. chromium AND
  //    ii. the user-data-dir exists AND
  //    iii. the "profile" name exists as a subdirectory in the user-data-dir
  //      (in which case we have a clearly defined existing profile to use)
  // Any case other than one of the above cases is an error.

  // This is not the most concise way to check these cases, but meant
  // to be the easiest to follow, by matching the above exact criteria
  const isUserDataDirExisting = await isDirReadable(args.userDataDir);

  const isCaseOne = !args.userDataDir;
  const isCaseTwo = !isCaseOne && args.userDataDir && !isUserDataDirExisting;
  const isCaseThree =
    !isCaseOne && !isCaseTwo && !isChromium && isUserDataDirExisting;

  const isProfileReadable = await isDirReadable(args.userDataDir, args.profile);
  const isCaseFour =
    !isCaseOne &&
    !isCaseTwo &&
    !isCaseThree &&
    isChromium &&
    isUserDataDirExisting &&
    isProfileReadable;

  let validatedUserDataDir, validatedProfile;
  if (isCaseOne) {
    const tempDirPath = await mkdtempDisposable(join(tmpdir(), programName));
    validatedUserDataDir = tempDirPath.path;
  } else if (isCaseTwo || isCaseThree) {
    validatedUserDataDir = args.userDataDir;
  } else if (isCaseFour) {
    validatedUserDataDir = join(args.userDataDir, args.profile);
    validatedProfile = args.profile;
  } else {
    throw new Error(
      "Invalid user-data-dir config.  Either must specify no " +
        "user-data-dir, or a user-data-dir argument for a directory that " +
        "does not currently exist, or specify a valid user-data-dir (with " +
        "the specified profile as a subdirectory in the user-data-dir if " +
        "chromium).",
    );
  }

  // We only allow the `binary` argument for Chromium-family browsers,
  // since we can do our measurements on the "stock" versions of these.
  // For Gecko and WebKit browsers, these require the playwright patches
  // for our measurements to succeed, and so we necessarily have to use
  // the playwright provided ones.
  let binaryPath: Path | undefined;

  // If we weren't passed a path to a browser binary, use the paths to the
  // playwright binaries.
  if (args.binary_path === undefined) {
    switch (args.browser) {
      case BrowserType.Brave:
        throw new Error(
          "Must include a binary path when testing Brave (since " +
            "playwright does not have a default Brave binary included",
        );
      case BrowserType.Chromium:
        binaryPath = chromium.executablePath();
        break;
      case BrowserType.Gecko:
        binaryPath = firefox.executablePath();
        break;
      case BrowserType.WebKit:
        binaryPath = webkit.executablePath();
        break;
    }
  } else {
    assert(typeof args.binary_path === "string");
    switch (args.browser) {
      case BrowserType.Brave:
      case BrowserType.Chromium:
        if (!(await isPathToExecFile(args.binary_path))) {
          throw new Error(
            `Invalid binary path. "${args.binary_path}" is not an ` +
              "executable file.",
          );
        }
        binaryPath = args.binary_path;
        break;
      case BrowserType.Gecko:
      case BrowserType.WebKit:
        throw new Error(
          "Invalid binary path. Unable to use --binary argument " +
            "with --browser=firefox or gecko, since these tests only work with " +
            "the playwright-patched versions of these browsers. You can install " +
            'them with "npm run install-browsers".',
        );
    }
  }
  assert.ok(binaryPath);

  if (args.height <= 0 || args.width <= 0) {
    throw new Error(
      "The height and width of the viewport must both be " +
        " positive values.",
    );
  }

  assert(typeof args.height === "string");
  const viewportHeight = parseInt(args.height, 10);
  assert.notDeepStrictEqual(viewportHeight, NaN);

  assert(typeof args.width === "string");
  const viewportWidth = parseInt(args.width, 10);
  assert.notDeepStrictEqual(viewportWidth, NaN);

  if (args.timeout <= 0) {
    throw new Error("The --timeout argument must be a positive number.");
  } else if (args.timeout > 500) {
    throw new Error(
      "You have a very high value for seconds. Note this is " +
        "seconds, not milliseconds.",
    );
  }
  assert(typeof args.timeout === "string");
  const timeoutSeconds = parseInt(args.timeout, 10);
  assert.notDeepStrictEqual(timeoutSeconds, NaN);

  assert(args.browser in BrowserType);
  const browserType = args.browser as BrowserType;

  assert(args.logging in LoggingLevel);
  const loggingLevel = args.logging as LoggingLevel;

  const measurementTypes: MeasurementType[] = [];
  for (const aMeasurementType of args.measurements) {
    assert(aMeasurementType in MeasurementType);
    measurementTypes.push(aMeasurementType as MeasurementType);
  }

  assert(typeof args.seconds === "number");

  return {
    binary: binaryPath,
    browser: browserType,
    loggingLevel: loggingLevel,
    measurements: measurementTypes,
    profile: validatedProfile,
    seconds: args.seconds,
    timeout: timeoutSeconds,
    url: args.url,
    userDataDir: validatedUserDataDir,
    viewport: {
      height: viewportHeight,
      width: viewportWidth,
    },
  };
};
