import assert from "node:assert/strict";
import {
  access,
  constants,
  mkdtempDisposable,
  open,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { Namespace } from "argparse";
import { chromium, firefox, webkit } from "playwright";

import { BrowserType, MeasurementType, Path, RunConfig } from "./types.js";
import { LoggingLevel } from "./logging.js";

const { R_OK, W_OK, X_OK } = constants;
const programName = "privacy-perf-comparisons";
const validSchemes = ["http:", "https:"];

const _fileCheck = async (
  mode: number,
  ...segments: Path[]
): Promise<boolean> => {
  try {
    await access(join(...segments), mode);
    return true;
  } catch {
    return false;
  }
};

const isPathToDir = async (...segments: Path[]): Promise<boolean> => {
  try {
    const fsResult = await stat(join(...segments));
    return fsResult.isDirectory();
  } catch {
    return false;
  }
};

const isPathToReadableDir = async (...segments: Path[]): Promise<boolean> => {
  const isPathADir = await isPathToDir(...segments);
  if (!isPathADir) {
    return false;
  }
  return await _fileCheck(R_OK, ...segments);
};

const isPathToWriteableDir = async (...segments: Path[]): Promise<boolean> => {
  const isPathADir = await isPathToDir(...segments);
  if (!isPathADir) {
    return false;
  }
  return await _fileCheck(W_OK | X_OK, ...segments);
};

const isPathToFile = async (...segments: Path[]): Promise<boolean> => {
  try {
    const fsResult = await stat(join(...segments));
    return fsResult.isFile();
  } catch {
    return false;
  }
};

const isPathToExecFile = async (...segments: Path[]): Promise<boolean> => {
  return await _fileCheck(X_OK, ...segments);
};

const isPathToWritableFile = async (...segments: Path[]): Promise<boolean> => {
  const isPathFile = await isPathToFile(...segments);
  if (!isPathFile) {
    return false;
  }
  return await _fileCheck(W_OK, ...segments);
};

const makeResultFilename = async (dir: Path, url: URL): Promise<Path> => {
  const fileName = url.hostname.replace(/[^a-z0-9.\-_]/gi, "_").toLowerCase();
  const fileExt = ".json";
  const attemptMax = 1000;

  let attempt = 0;
  while (attempt < attemptMax) {
    const fileInfix = attempt > 0 ? `_${attempt.toString()}` : "";
    const fileGuess = fileName + fileInfix + fileExt;
    if (!(await isPathToFile(dir, fileGuess))) {
      return join(dir, fileGuess);
    }
    attempt += 1;
  }

  throw new Error(
    "Unable to generate a file to write to. In target directory, attempted " +
      "files already exist.\n" +
      `target directory: ${dir}\n` +
      `initial attempted file: ${fileName}${fileExt}\n` +
      `other attempts: ${fileName}_[1...${attemptMax.toString()}].json`,
  );
};

// Generate the stream to write results to. This might be a stream for
// a location on disk to write results to, or it might be STDOUT.
//
// The rules for where to write results to are the following:
// - if the output argument was empty or unused, then results are written to
//   STDOUT, else
// - if the output argument matches an existing file on disk, then we try to
//   overwrite that file, else
// - if the output argument matches a directory on disk, then we generate
//   a filename based on the initial URL being measured, and write to that file
// - Otherwise, try to write results to the given path.
const handleForResults = async (
  output: undefined | Path,
  url: URL,
): Promise<Writable> => {
  // Case 1, in the function docblock: write to stdout.
  if (output === undefined || output.trim().length === 0) {
    return process.stdout;
  }

  // Case 2 in the function docblock: write to given path.
  if (await isPathToFile(output)) {
    if (!(await isPathToWritableFile(output))) {
      throw new Error(`--output path is not writeable: "${output}"`);
    }
    return (await open(output, "w")).createWriteStream();
  }

  // Case 3 in function docblock: write to file in given directory.
  if (await isPathToDir(output)) {
    if (!(await isPathToWriteableDir(output))) {
      throw new Error(`--output directory is not writeable: "${output}"`);
    }
    const resultPath = await makeResultFilename(output, url);
    return (await open(resultPath, "w")).createWriteStream();
  }

  // Case 4, try to write to the given output path.
  return (await open(output, "w")).createWriteStream();
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
  const userDataDir = args.userDataDir as undefined | string;
  assert(userDataDir === undefined || userDataDir === "string");
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
  let isUserDataDirExisting: boolean | undefined;
  let isProfileReadable: boolean | undefined;
  if (!userDataDir) {
    isUserDataDirExisting = false;
    isProfileReadable = false;
  } else if (await isPathToReadableDir(userDataDir)) {
    isUserDataDirExisting = true;
    isProfileReadable = await isPathToReadableDir(userDataDir, args.profile);
  }

  const isCaseOne = !userDataDir;
  const isCaseTwo = !isCaseOne && !isUserDataDirExisting;
  const isCaseThree =
    !isCaseOne && !isCaseTwo && !isChromium && isUserDataDirExisting;

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
    validatedUserDataDir = userDataDir;
  } else if (isCaseFour) {
    validatedUserDataDir = join(userDataDir, args.profile);
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

  assert(typeof args.timeout === "number");
  if (args.timeout <= 0) {
    throw new Error("The --timeout argument must be a positive number.");
  } else if (args.timeout > 500) {
    throw new Error(
      "You have a very high value for seconds. Note this is " +
        "seconds, not milliseconds.",
    );
  }

  const browserType = args.browser as BrowserType;
  assert(Object.values(BrowserType).includes(browserType));

  const loggingLevel = args.logging as LoggingLevel;
  assert(Object.values(LoggingLevel).includes(loggingLevel));

  const measurementTypes: MeasurementType[] = [];
  for (const aMeasurementTypeRaw of args.measurements) {
    const measurementType = aMeasurementTypeRaw as MeasurementType;
    assert(Object.values(MeasurementType).includes(measurementType));
    measurementTypes.push(measurementType);
  }

  assert(typeof args.height === "number");
  assert(typeof args.width === "number");
  assert(typeof args.seconds === "number");

  assert(!args.output || typeof args.output === "string");
  const outputPath = args.output as undefined | "string";
  const outputHandle = await handleForResults(outputPath, args.url);

  return {
    binary: binaryPath,
    browser: browserType,
    loggingLevel: loggingLevel,
    measurements: measurementTypes,
    output: outputHandle,
    profile: validatedProfile,
    seconds: args.seconds,
    timeout: args.timeout,
    url: args.url,
    userDataDir: validatedUserDataDir,
    viewport: {
      height: args.height,
      width: args.width,
    },
  };
};
