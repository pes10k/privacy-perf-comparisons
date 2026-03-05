Browser Perf Logger
===

0.1.2
---

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
