#!/usr/bin/env node
import { ArgumentParser } from 'argparse';
import { Browsers } from './consts.js';
import { validateArgs } from './validate.js';
const parser = new ArgumentParser({
    description: 'Run performance tests for a playwright version of a browser.',
});
parser.add_argument('-b', '--browser', {
    choices: [
        Browsers.Chromium,
        Browsers.WebKit,
        Browsers.Gecko,
    ],
    help: 'Which browser family to use for this test.',
    required: true,
    type: 'choice',
});
parser.add_argument('-d', '--user-data-dir', {
    help: 'Path to the user data directory to load and save persistent state '
        + 'to. For chromium browsers, this will be a directory containing multiple '
        + 'profiles. For other browsers, this directory will be the state for '
        + 'a single profile.',
});
parser.add_argument('-p', '--profile-name', {
    help: 'For chromium runs, this is the name of the profile in an existing '
        + '--user-data-dir directory to load. (Only used for Chromium browsers)',
    default: 'Default',
});
parser.add_argument('-t', '--time', {
    help: 'Number of seconds to let the page load before closing the page.',
    type: 'int',
    default: 30,
});
parser.add_argument('-u', '--url', {
    help: 'The URL to run measurements against. Should be a full URL (i.e., '
        + 'at least a scheme and a domain).',
    type: URL,
});
const rawArgs = parser.parse_args();
const args = validateArgs(rawArgs);
console.log(args);
