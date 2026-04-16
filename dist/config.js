import assert from "node:assert/strict";
import { access, constants, mkdtempDisposable, open, readFile, stat, } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { BrowserType, MeasurementType, } from "./types.js";
import { getLogger, LoggingLevel } from "./logging.js";
const { R_OK, W_OK, X_OK } = constants;
const programName = "privacy-perf-comparisons";
const validSchemes = ["http:", "https:"];
export const defaultLaunchArgs = () => {
    return {
        browser: BrowserType.Chromium,
        loggingLevel: LoggingLevel.Info,
        measurements: Object.values(MeasurementType),
        preservePages: false,
        profile: "Default",
        seconds: 30,
        timeout: 30,
        viewport: {
            height: 720,
            width: 1280,
        },
    };
};
let cachedVersion;
export const getVersion = async () => {
    if (cachedVersion !== undefined) {
        return cachedVersion;
    }
    const packageText = await readFile("./package.json", "utf8");
    assert(typeof packageText === "string");
    const packageData = JSON.parse(packageText);
    const packageVersion = packageData.version;
    assert(packageVersion);
    cachedVersion = packageVersion;
    return cachedVersion;
};
const fileCheck = async (mode, ...segments) => {
    try {
        await access(join(...segments), mode);
        return true;
    }
    catch {
        return false;
    }
};
const isPathToDir = async (...segments) => {
    try {
        const fsResult = await stat(join(...segments));
        return fsResult.isDirectory();
    }
    catch {
        return false;
    }
};
const isPathToReadableDir = async (...segments) => {
    const isPathADir = await isPathToDir(...segments);
    if (!isPathADir) {
        return false;
    }
    return await fileCheck(R_OK, ...segments);
};
const isPathToWriteableDir = async (...segments) => {
    const isPathADir = await isPathToDir(...segments);
    if (!isPathADir) {
        return false;
    }
    return await fileCheck(W_OK | X_OK, ...segments);
};
const isPathToFile = async (...segments) => {
    try {
        const fsResult = await stat(join(...segments));
        return fsResult.isFile();
    }
    catch {
        return false;
    }
};
const isPathToExecFile = async (...segments) => {
    return await fileCheck(X_OK, ...segments);
};
const isPathToWritableFile = async (...segments) => {
    const isPathFile = await isPathToFile(...segments);
    if (!isPathFile) {
        return false;
    }
    return await fileCheck(W_OK, ...segments);
};
const makeResultFilename = async (dir, url) => {
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
    throw new Error("Unable to generate a file to write to. In target directory, attempted " +
        "files already exist.\n" +
        `target directory: ${dir}\n` +
        `initial attempted file: ${fileName}${fileExt}\n` +
        `other attempts: ${fileName}_[1...${attemptMax.toString()}].json`);
};
const ignoreConfChecksEnvVarName = "PERF_CHECKS_IGNORE";
const shouldIgnoreConfChecks = () => {
    if (process.env[ignoreConfChecksEnvVarName] === "1") {
        return true;
    }
    return false;
};
// Generate the stream to write results to. This might be a stream for
// a location on disk to write results to, or it might be STDOUT.
//
// The rules for where to write results to are the following:
// - if the output argument was empty, unused, or "-", then results are written
//   to STDOUT, else
// - if the output argument matches an existing file on disk, then we try to
//   overwrite that file, else
// - if the output argument matches a directory on disk, then we generate
//   a filename based on the initial URL being measured, and write to that file
// - Otherwise, try to write results to the given path.
const handleForResults = async (output, url) => {
    // Case 1, in the function docblock: write to stdout.
    if (output === undefined || output.trim().length === 0 || output === "-") {
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
export const runConfigForArgs = async (args) => {
    const loggingLevel = args.logging;
    assert(Object.values(LoggingLevel).includes(loggingLevel));
    const logger = getLogger(loggingLevel);
    const log = logger.prefixedLogger("runConfigForArgs(): ");
    log.verbose("Raw arguments=", args);
    assert(args.url instanceof URL);
    if (!validSchemes.includes(args.url.protocol)) {
        throw new Error("Invalid URL. Must contain a http(s) scheme and hostname. Received " +
            `scheme "${args.url.protocol}"`);
    }
    if (!args.url.hostname) {
        throw new Error("Invalid URL. Must contain a hostname. Received " +
            `hostname "${args.url.hostname}"`);
    }
    if (args.seconds <= 0) {
        throw new Error('Invalid "seconds". Must be a positive integer.');
    }
    const isChromium = args.browser === BrowserType.Chromium || args.browser === BrowserType.Brave;
    assert(typeof args.profile === "string");
    if (args.browser === BrowserType.Gecko && args.profile !== args.profile) {
        throw new Error("Cannot use different profiles within the same profile " +
            "directory for Gecko browsers. Use --user-data-dir to use different " +
            "browser configurations for gecko browsers (instead of multiple " +
            "profiles within the same profile directory).");
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
    let userDataDirArg;
    if (typeof args.user_data_dir === "string") {
        userDataDirArg = args.user_data_dir;
    }
    let isUserDataDirExisting;
    let isProfileReadable;
    if (!userDataDirArg) {
        isUserDataDirExisting = false;
        isProfileReadable = false;
    }
    else if (await isPathToReadableDir(userDataDirArg)) {
        isUserDataDirExisting = true;
        isProfileReadable = await isPathToReadableDir(userDataDirArg, args.profile);
    }
    const isCaseOne = !userDataDirArg;
    const isCaseTwo = !isCaseOne && !isUserDataDirExisting;
    const isCaseThree = !isCaseOne && !isCaseTwo && !isChromium && isUserDataDirExisting;
    const isCaseFour = !isCaseOne &&
        !isCaseTwo &&
        !isCaseThree &&
        isChromium &&
        isUserDataDirExisting &&
        isProfileReadable;
    let validatedUserDataDir, validatedProfile;
    log.verbose("--user-data-dir validation");
    if (isCaseOne) {
        const tempDirPath = await mkdtempDisposable(join(tmpdir(), programName));
        validatedUserDataDir = tempDirPath.path;
        log.verbose("\t", "- creating temp user-data dir: ", validatedUserDataDir);
    }
    else if (isCaseTwo) {
        validatedUserDataDir = userDataDirArg;
        log.verbose("\t", "- creating new user-data dir: ", validatedUserDataDir);
    }
    else if (isCaseThree) {
        validatedUserDataDir = userDataDirArg;
        log.verbose("\t", "- using existing user-data dir: ", validatedUserDataDir);
    }
    else if (isCaseFour) {
        assert(userDataDirArg);
        // validatedUserDataDir = join(userDataDirArg, args.profile);
        validatedUserDataDir = userDataDirArg;
        validatedProfile = args.profile;
        log.verbose("\t", "- using user-data dir: ", validatedUserDataDir);
        log.verbose("\t", "- with profile name: ", args.profile);
    }
    else {
        throw new Error("Invalid --user-data-dir config.  Either must specify no " +
            "user-data-dir, or a user-data-dir argument for a directory that " +
            "does not currently exist, or specify a valid user-data-dir (with " +
            "the specified profile as a subdirectory in the user-data-dir if " +
            "chromium).");
    }
    assert(validatedUserDataDir);
    // We only allow the `binary` argument for Chromium-family browsers,
    // since we can do our measurements on the "stock" versions of these.
    // For Gecko and WebKit browsers, these require the playwright patches
    // for our measurements to succeed, and so we necessarily have to use
    // the playwright provided ones.
    let binaryPath;
    // If we weren't passed a path to a browser binary, use the paths to the
    // playwright binaries.
    let isUsingPlaywrightBinary = false;
    if (args.binary_path === undefined) {
        switch (args.browser) {
            case BrowserType.Brave:
                throw new Error("Must include a binary path when testing Brave (since " +
                    "playwright does not have a default Brave binary included).");
            case BrowserType.Chromium:
                isUsingPlaywrightBinary = true;
                binaryPath = chromium.executablePath();
                break;
            case BrowserType.Gecko:
                isUsingPlaywrightBinary = true;
                binaryPath = firefox.executablePath();
                break;
            case BrowserType.WebKit:
                isUsingPlaywrightBinary = true;
                binaryPath = webkit.executablePath();
                break;
        }
    }
    else {
        assert(typeof args.binary_path === "string");
        if (!(await isPathToExecFile(args.binary_path))) {
            throw new Error(`Invalid binary path. "${args.binary_path}" is not an ` +
                "executable file.");
        }
        binaryPath = args.binary_path;
    }
    assert.ok(binaryPath);
    if (args.height <= 0 || args.width <= 0) {
        throw new Error("The height and width of the viewport must both be " +
            " positive values.");
    }
    assert(typeof args.timeout === "number");
    if (args.timeout <= 0) {
        throw new Error("The --timeout argument must be a positive number.");
    }
    else if (args.timeout > 500) {
        throw new Error("You have a very high value for seconds. Note this is " +
            "seconds, not milliseconds.");
    }
    const browserType = args.browser;
    assert(Object.values(BrowserType).includes(browserType));
    const mesToPerform = [];
    for (const aMeasurementTypeRaw of args.measurements) {
        const measurementType = aMeasurementTypeRaw;
        assert(Object.values(MeasurementType).includes(measurementType));
        mesToPerform.push(measurementType);
    }
    // Only some measurements require the playwright-modified binaries; some
    // tests will run fine even in stock versions of Firefox, Safari, etc.
    // Here we check 1. if any of the measurements we're about to run (specified
    // with --measurements) require the capabilities that playwright patches into
    // Gecko and WebKit, and 2. if it looks like the binary we're about to run
    // those measurements (specified with --binary-path) includes those
    // capabilities.
    const mesRequiringExt = new Set([MeasurementType.Network]);
    const doMesRequireExt = new Set(mesToPerform).intersection(mesRequiringExt).size > 0;
    const doesBrowserSupportExt = isChromium || isUsingPlaywrightBinary;
    if (doMesRequireExt && !doesBrowserSupportExt) {
        if (!shouldIgnoreConfChecks()) {
            throw new Error("The specified measurements cannot be run in the " +
                "specified browser. These measurements require either a Chromium " +
                "browser, or a browser including the playwright patches.\n\n" +
                "If you think this is incorrect, you can override this check with " +
                `${ignoreConfChecksEnvVarName}=1`);
        }
    }
    assert(typeof args.height === "number");
    assert(typeof args.width === "number");
    assert(typeof args.seconds === "number");
    assert(!args.output || typeof args.output === "string");
    const outputPath = args.output;
    const outputHandle = await handleForResults(outputPath, args.url);
    assert(typeof args.preserve_pages === "boolean");
    const preservePages = args.preserve_pages;
    let additionalArgs;
    if (Array.isArray(args.args)) {
        additionalArgs = args.args.map((x) => `--${String(x)}`);
    }
    let firefoxPrefs;
    if (args.firefox_user_prefs) {
        assert(typeof args.firefox_user_prefs === "string");
        if (browserType !== BrowserType.Gecko) {
            throw new Error("Cannot use the --firefox-user-prefs (-f) argument for any --browser " +
                `argument other than 'gecko'; received --browser = '${browserType}'.`);
        }
        try {
            firefoxPrefs = JSON.parse(args.firefox_user_prefs);
        }
        catch (err) {
            throw new Error("Received invalid JSON string for --firefox-user-prefs (-f) " +
                `argument. Argument '${args.firefox_user_prefs}' produced format ` +
                "error: \n" +
                err.toString());
        }
    }
    return {
        args: additionalArgs,
        binary: binaryPath,
        browser: browserType,
        firefoxUserPrefs: firefoxPrefs,
        loggingLevel: loggingLevel,
        measurements: mesToPerform,
        output: outputHandle,
        preservePages: preservePages,
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
//# sourceMappingURL=config.js.map