#!/usr/bin/env node
import { ArgumentParser, ArgumentDefaultsHelpFormatter } from 'argparse';
import { BrowserType, LoggingLevel } from './types.js';
import { runConfigForArgs } from './config.js';
const parser = new ArgumentParser({
    description: 'Run performance tests for a playwright version of a browser.',
    formatter_class: ArgumentDefaultsHelpFormatter,
});
parser.add_argument('-b', '--browser', {
    choices: Object.values(BrowserType),
    help: 'Which browser family to use for this test.',
    default: BrowserType.Brave,
});
parser.add_argument('-d', '--user-data-dir', {
    help: 'Path to the user data directory to load and save persistent state '
        + 'to. For chromium browsers, this will be a directory containing multiple '
        + 'profiles. For other browsers, this directory will be the state for '
        + 'a single profile.',
});
parser.add_argument('-p', '--profile', {
    help: 'For chromium runs, this is the name of the profile in an existing '
        + '--user-data-dir directory to load. (Only used for Chromium browsers)',
    default: 'Default',
});
parser.add_argument('-t', '--timeout', {
    help: 'Number of seconds to wait for the browser to complete tasks '
        + 'separate from loading the given page (e.g., open the browser, '
        + 'navigate to the given URL, etc.)',
    type: 'int',
    default: 30,
});
parser.add_argument('-s', '--seconds', {
    help: 'Number of seconds to wait while measuring page performance.',
    type: 'int',
    default: 30,
});
parser.add_argument('-x', '--binary-path', {
    help: 'Path to the browser binary to run the measurements with. Note that '
        + 'this argument is only valid for Chromium-family browsers, since '
        + 'Chromium family browsers do not require any playwright patches, '
        + 'while the gecko and webkit ones do.',
});
parser.add_argument('-u', '--url', {
    help: 'The URL to run measurements against. Should be a full URL (i.e., '
        + 'at least a scheme and a domain).',
    type: URL,
});
parser.add_argument('--height', {
    help: 'The height of the browser viewport to use when loading pages.',
    type: 'int',
    default: 1024,
});
parser.add_argument('--width', {
    help: 'The width of the browser viewport to use when loading pages.',
    type: 'int',
    default: 1280,
});
parser.add_argument('--logging', {
    help: 'What level of information to include when printing information during '
        + 'the measurement.',
    choices: Object.values(LoggingLevel),
    default: LoggingLevel.Info,
});
const rawArgs = parser.parse_args();
const runConfig = runConfigForArgs(rawArgs);
console.log(runConfig);
