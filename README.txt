
> privacy-perf-comparisons@0.0.1 start
> node ./dist/cli.js --help

usage: cli.js [-h] [-b {brave,chromium,gecko,webkit}] [-d USER_DATA_DIR]
              [-p PROFILE] [-t TIMEOUT] [-s SECONDS] [-x BINARY_PATH] [-u URL]
              [--height HEIGHT] [--width WIDTH]
              [--logging {none,info,verbose}]

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
                        single profile. (default: undefined)
  -p PROFILE, --profile PROFILE
                        For chromium runs, this is the name of the profile in
                        an existing --user-data-dir directory to load. (Only
                        used for Chromium browsers) (default: Default)
  -t TIMEOUT, --timeout TIMEOUT
                        Number of seconds to wait for the browser to complete
                        tasks separate from loading the given page (e.g., open
                        the browser, navigate to the given URL, etc.)
                        (default: 30)
  -s SECONDS, --seconds SECONDS
                        Number of seconds to wait while measuring page
                        performance. (default: 30)
  -x BINARY_PATH, --binary-path BINARY_PATH
                        Path to the browser binary to run the measurements
                        with. Note that this argument is only valid for
                        Chromium-family browsers, since Chromium family
                        browsers do not require any playwright patches, while
                        the gecko and webkit ones do. (default: undefined)
  -u URL, --url URL     The URL to run measurements against. Should be a full
                        URL (i.e., at least a scheme and a domain). (default:
                        undefined)
  --height HEIGHT       The height of the browser viewport to use when loading
                        pages. (default: 1024)
  --width WIDTH         The width of the browser viewport to use when loading
                        pages. (default: 1280)
  --logging {none,info,verbose}
                        What level of information to include when printing
                        information during the measurement. (default: info)
