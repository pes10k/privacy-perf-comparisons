Browser Perf Logger
===

HEAD
---

Remove `type: MeasurementType` property on the `BaseMeasurer` class
and its children. It was redundant with the already-existing
`BaseMeasurer.measurementType()` method.

Remove no-longer needed instrumentation method `addAutomationPageNavigation`
(no longer needed because the page instrumenting now covers these requests).

Further improve the approximation for size of headers when needing to calculate
it directly (i.e., when playwright's `Request.sizes()` throws).

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
