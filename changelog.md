Browser Perf Logger
===

0.2.6
---

Add context to response/request records for network measurements.

Remove support for named profiles (measurements must be taken with the default
profile in the user data directory).

0.2.5
---

Added `--firefox-user-prefs` argument, which takes a JSON text which are
set as `about:config` preferences and (importantly) override the
playwright firefox overrides.
See: https://github.com/microsoft/playwright/blob/main/browser_patches/firefox/preferences/playwright.cfg

Override many other configuration changes Playwright makes to Firefox
default preferences.

Minor typo fixes in error messages when validating arguments and building
a run configuration.

0.2.4
---

No longer pass `--disable-features=MacAppCodeSignClone` by default, as it
seems to create profile correctness issues.

0.2.3
---

Add ability to pass additional arguments to browsers from the CLI.

0.2.2
---

Add "memory-cpu" measurement option.

Add additional logging level `debug`.

0.2.1
---

Correct error where arguments for configuring the browser's screen and viewport
were treated as synonyms (instead of the correct use of those parameters, where
the "screen" values are determined by the viewport arguments).

Add "version" number to reports.

0.2.0
---

Remove `type: MeasurementType` property on the `BaseMeasurer` class
and its children. It was redundant with the already-existing
`BaseMeasurer.measurementType()` method.

Remove no-longer needed instrumentation method `addAutomationPageNavigation`
(no longer needed because the page instrumenting now covers these requests).

Further improve the approximation for size of headers when needing to calculate
it directly (i.e., when playwright's `Request.sizes()` throws).

By default close all pages from previous session (and prevent them from
touching network). To keep previous behavior (i.e., maintain and open
all pages from the previous session) use `--preserve-pages`.

Add `Logger.prefixedLogger()` method to make it easier and more consistent
to create scoped log messages.

0.1.2
---

Fix error when Playwright would throw an error for fetching the size
of a "document" request made with an empty body.

Disable service workers by default in all browsers (to both ensure that
all network requests are visible to the network logging handlers, and to
limit "bleed" between website visits).

0.1.1
---

Correct bug where a `--profile` argument was required for non-Chromium
measurements.

Update config-validation checks to allow some measurements to be run, even
when it doesn't look like the specified browser includes the
functionality playwright patches into WebKit and Gecko.

Some better handling of expected and debugging in normal (i.e., `npm run go`)
and debug modes (i.e., `npm run go:debug`).

0.1.0
---

Add ability to direct output with an optional `--output` to a path on disk.

0.0.1
---

Init version
