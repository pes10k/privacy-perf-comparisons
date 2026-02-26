#!/usr/bin/env node
import assert from "node:assert/strict";
import { ArgumentParser, ArgumentDefaultsHelpFormatter, Namespace, } from "argparse";
import { launch } from "./browser.js";
import { runConfigForArgs } from "./config.js";
import { getLogger, LoggingLevel } from "./logging.js";
import { measureURL } from "./measure.js";
import { BrowserType, MeasurementType } from "./types.js";
const parser = new ArgumentParser({
    description: "Run performance tests for a playwright version of a browser.",
    formatter_class: ArgumentDefaultsHelpFormatter,
});
parser.add_argument("-b", "--browser", {
    choices: Object.values(BrowserType),
    default: BrowserType.Brave,
    help: "Which browser family to use for this test.",
});
parser.add_argument("-d", "--user-data-dir", {
    help: "Path to the user data directory to load and save persistent state " +
        "to. For chromium browsers, this will be a directory containing multiple " +
        "profiles. For other browsers, this directory will be the state for " +
        "a single profile. If not provided, will create a new temporary " +
        "user-data directory.",
});
parser.add_argument("-l", "--logging", {
    choices: Object.values(LoggingLevel),
    default: LoggingLevel.Info,
    help: "What level of information to include when printing information during " +
        "the measurement.",
});
parser.add_argument("-m", "--measurements", {
    choices: Object.values(MeasurementType),
    default: Object.values(MeasurementType),
    help: "Which measurements of performance to collect. By default, performs all " +
        "measurements.",
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
    default: "Default",
    help: "For chromium runs, this is the name of the profile in an existing " +
        "--user-data-dir directory to load. (Only used for Chromium browsers)",
});
parser.add_argument("-s", "--seconds", {
    default: 30,
    help: "Number of seconds to wait while measuring page performance.",
    type: "int",
});
parser.add_argument("-t", "--timeout", {
    default: 30,
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
parser.add_argument("-x", "--binary-path", {
    help: "Path to the browser binary to run the measurements with. Note that " +
        "this argument is only valid for Chromium-family browsers, since " +
        "Chromium family browsers do not require any playwright patches, " +
        "while the gecko and webkit ones do.",
});
parser.add_argument("--height", {
    default: 1024,
    help: "The height of the browser viewport to use when loading pages.",
    type: "int",
});
parser.add_argument("--width", {
    default: 1280,
    help: "The width of the browser viewport to use when loading pages.",
    type: "int",
});
const rawArgs = parser.parse_args();
assert(rawArgs instanceof Namespace);
const runConfig = await runConfigForArgs(rawArgs);
const { measurements, url, seconds, timeout, loggingLevel } = runConfig;
const logger = getLogger(loggingLevel);
const browserContext = await launch(logger, runConfig);
const results = await measureURL(logger, browserContext, url, seconds, timeout, measurements);
runConfig.output.write(JSON.stringify(results));
//# sourceMappingURL=cli.js.map