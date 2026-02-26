Browser Perf Logger
===

Setup
---

If you want to use any of the patched browsers that playwright maintains
(needed to run these tests with Firefox, Safari, or other Gecko or Webkit
based browsers), you'll need to run `npm run install-browsers` first.

Usage and Running
---

Run with `npm run go`.

Below is the output of `npm run go -- --help`.

```
> browser-perf-logger@0.1.0 go
> node ./dist/cli.js --help

usage: cli.js [-h] [-b {brave,chromium,gecko,webkit}] [-d USER_DATA_DIR]
              [-l {none,info,verbose}] [-m {network,timing}] [-o OUTPUT]
              [-p PROFILE] [-s SECONDS] [-t TIMEOUT] -u URL [-x BINARY_PATH]
              [--height HEIGHT] [--width WIDTH]

Run performance tests for a playwright version of a browser.

optional arguments:
  -h, --help            show this help message and exit
  -b {brave,chromium,gecko,webkit}, --browser {brave,chromium,gecko,webkit}
                        Which browser family to use for this test. (default:
                        brave)
  -d USER_DATA_DIR, --user-data-dir USER_DATA_DIR
                        Path to the user data directory to load and save
                        persistent state to. For chromium browsers, this will
                        be a directory containing multiple profiles. For other
                        browsers, this directory will be the state for a
                        single profile. If not provided, will create a new
                        temporary user-data directory. (default: undefined)
  -l {none,info,verbose}, --logging {none,info,verbose}
                        What level of information to include when printing
                        information during the measurement. (default: info)
  -m {network,timing}, --measurements {network,timing}
                        Which measurements of performance to collect. By
                        default, performs all measurements. (default:
                        network,timing)
  -o OUTPUT, --output OUTPUT
                        Path to write results to. By default results are
                        written to STDOUT, but this can instead write the
                        measurement results to a file. If --output is called
                        with the path to a directory, results will be written
                        to a file in that directory with a name derived from
                        the --url argument. If --output is called with a path
                        that matches an existing file, or a path where no file
                        exists, the results will be written to that path.
                        (default: undefined)
  -p PROFILE, --profile PROFILE
                        For chromium runs, this is the name of the profile in
                        an existing --user-data-dir directory to load. (Only
                        used for Chromium browsers) (default: Default)
  -s SECONDS, --seconds SECONDS
                        Number of seconds to wait while measuring page
                        performance. (default: 30)
  -t TIMEOUT, --timeout TIMEOUT
                        Number of seconds to wait for the browser to complete
                        tasks separate from loading the given page (e.g., open
                        the browser, navigate to the given URL, etc.)
                        (default: 30)
  -u URL, --url URL     The URL to run measurements against. Should be a full
                        URL (i.e., at least a scheme and a domain). (default:
                        undefined)
  -x BINARY_PATH, --binary-path BINARY_PATH
                        Path to the browser binary to run the measurements
                        with. Note that this argument is only valid for
                        Chromium-family browsers, since Chromium family
                        browsers do not require any playwright patches, while
                        the gecko and webkit ones do. (default: undefined)
  --height HEIGHT       The height of the browser viewport to use when loading
                        pages. (default: 1024)
  --width WIDTH         The width of the browser viewport to use when loading
                        pages. (default: 1280)
```