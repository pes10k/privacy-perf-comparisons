#!/usr/bin/env node
import assert from "node:assert/strict";
import { ArgumentParser, ArgumentDefaultsHelpFormatter, Namespace, } from "argparse";
import { launch } from "./browser.js";
import { defaultLaunchArgs, getVersion, runConfigForArgs } from "./config.js";
import { getLogger, LoggingLevel } from "./logging.js";
import { measureURL } from "./measure.js";
import { BrowserType, MeasurementType } from "./types.js";
const isDebugMode = process.env.PERF_TESTS_DEBUG === "1";
const defaultArgs = defaultLaunchArgs();
const parser = new ArgumentParser({
    description: "Run performance tests for a playwright version of a browser.",
    formatter_class: ArgumentDefaultsHelpFormatter,
});
parser.add_argument("-b", "--browser", {
    choices: Object.values(BrowserType),
    default: defaultArgs.browser,
    help: "Which browser family to use for this test.",
});
parser.add_argument("-d", "--user-data-dir", {
    help: "Path to the user data directory to load and save persistent state " +
        "to. For Chromium browsers, this will be a directory containing multiple " +
        "profiles. For other browsers, this directory will be the state for " +
        "a single profile. If not provided, will create a new temporary " +
        "user-data directory.\n\n" +
        "*Note:* Gecko/Firefox measurements should use this flag for " +
        "specifying the path for storing persistent user data (and not " +
        "--profile).",
});
parser.add_argument("-l", "--logging", {
    choices: Object.values(LoggingLevel),
    default: defaultArgs.loggingLevel,
    help: "What level of information to include when printing information during " +
        "the measurement.",
});
parser.add_argument("-m", "--measurements", {
    choices: Object.values(MeasurementType),
    default: defaultArgs.measurements,
    help: "Which measurements of performance to collect. By default, performs all " +
        "measurements.",
    nargs: "+",
});
parser.add_argument("-o", "--output", {
    help: "Path to write results to. By default results are written to STDOUT, " +
        "but this can instead write the measurement results to a file.\n\n" +
        "If --output is called with the path to a directory, results will be " +
        "written to a file in that directory with a name derived from the " +
        "--url argument.\n\n" +
        "If --output is called with a path that matches an existing file, or " +
        "a path where no file exists, the results will be written to that path.",
});
parser.add_argument("-p", "--profile", {
    default: defaultArgs.profile,
    help: "For Chromium, this is the name of the profile in an existing " +
        "--user-data-dir directory to load. (Only used for Chromium browsers)",
});
parser.add_argument("-r", "--preserve-pages", {
    action: "store_true",
    default: defaultArgs.preservePages,
    help: "Preserve and reopen any pages and tabs that are set as open in the " +
        "specified --user-data-dir (if any). By default the tool will prevent " +
        "any pages from being automatically opened, but if this argument is set, " +
        "then any existing pages will be reopened before taking any measurements.",
});
parser.add_argument("-s", "--seconds", {
    default: defaultArgs.seconds,
    help: "Number of seconds to wait while measuring page performance.",
    type: "int",
});
parser.add_argument("-t", "--timeout", {
    default: defaultArgs.timeout,
    help: "Number of seconds to wait for the browser to complete tasks " +
        "separate from loading the given page (e.g., open the browser, " +
        "navigate to the given URL, etc.)",
    type: "int",
});
parser.add_argument("-u", "--url", {
    help: "The URL to run measurements against. Should be a full URL (i.e., " +
        "at least a scheme and a domain).",
    required: true,
    type: URL,
});
parser.add_argument("-v", "--version", {
    action: "version",
    version: await getVersion(),
});
parser.add_argument("-x", "--binary-path", {
    help: "Path to the browser binary to run the measurements with. Note that " +
        "this argument is only valid for Chromium-family browsers, since " +
        "Chromium family browsers do not require any playwright patches, " +
        "while the gecko and webkit ones do.",
});
parser.add_argument("--height", {
    default: defaultArgs.viewport?.height,
    help: "The height of the browser viewport to use when loading pages.",
    type: "int",
});
parser.add_argument("--width", {
    default: defaultArgs.viewport?.width,
    help: "The width of the browser viewport to use when loading pages.",
    type: "int",
});
try {
    const rawArgs = parser.parse_args();
    assert(rawArgs instanceof Namespace);
    const runConfig = await runConfigForArgs(rawArgs);
    const { measurements, url, seconds, timeout } = runConfig;
    const { loggingLevel, preservePages } = runConfig;
    const logger = getLogger(loggingLevel);
    const browserContext = await launch(logger, runConfig);
    const results = await measureURL(logger, browserContext, url, seconds, timeout, measurements, preservePages);
    runConfig.output.write(JSON.stringify(results));
    process.exit(0);
}
catch (err) {
    if (isDebugMode) {
        throw err;
    }
    if (err instanceof Error) {
        console.error(err.toString());
    }
    else {
        console.error(err);
    }
    process.exit(1);
}
//# sourceMappingURL=cli.js.map