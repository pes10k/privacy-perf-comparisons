import assert from "node:assert/strict";

import { BrowserContext } from "@playwright/test";

import { getVersion } from "./config.js";
import { Logger } from "./logging.js";
import {
  BaseMeasurer,
  MeasurementResult,
  BaseMeasurerChild,
} from "./measurements/base.js";
import { MemoryMeasurer } from "./measurements/memory.js";
import { NetworkMeasurer } from "./measurements/network.js";
import { TimingMeasurer } from "./measurements/timing.js";
import { MeasurementType, Report } from "./types.js";

const measurerTypeToClassMap: Record<MeasurementType, BaseMeasurerChild> = {
  [MeasurementType.Memory]: MemoryMeasurer,
  [MeasurementType.Network]: NetworkMeasurer,
  [MeasurementType.Timing]: TimingMeasurer,
};

export const measureURL = async (
  logger: Logger,
  context: BrowserContext,
  url: URL,
  seconds: number,
  timeout: number,
  measurements: MeasurementType[],
  preservePages: boolean,
): Promise<Report> => {
  const log = logger.prefixedLogger("Measure(): ");
  const prevPages = context.pages();
  const numPrevPages = prevPages.length;
  log.verbose(`pages from previous session: ${numPrevPages.toString()} pages.`);

  // Unless we're preserving existing pages, we need to force things to
  // start in a clean profile by closing all open pages, and then
  // re-enabling networking .
  if (!preservePages) {
    for (const aPage of prevPages) {
      const pageUrl = aPage.url();
      log.verbose("closing page: " + pageUrl);
      await aPage.close();
      log.verbose("page closed: " + pageUrl);
    }
    log.verbose("Re-enabling network for context.");
    await context.setOffline(false);
    log.verbose("Networking re-enabled.");
  }

  // Create and instantiate any measurement classes that were requested
  const measurers = new Map<MeasurementType, BaseMeasurer>();
  for (const aMeasurementType of measurements) {
    const aMeasurerType = measurerTypeToClassMap[aMeasurementType];
    const aMeasurer = new aMeasurerType(logger, url, context);
    aMeasurer.instrumentContext();
    log.verbose("Instrumenting context for measurement: ", aMeasurementType);
    measurers.set(aMeasurementType, aMeasurer);
  }

  // Triggering beforeStart lifetime event for all measurements
  for (const aMeasurer of measurers.values()) {
    await aMeasurer.beforeStart();
  }

  // And now triggering "start" event for all measurements
  for (const aMeasurer of measurers.values()) {
    aMeasurer.start();
  }
  log.verbose("Creating empty page (i.e., new tab).");
  const page = await context.newPage();

  const startTime = new Date();
  log.info(`Navigating to url="${page.url()}"`);
  const navRequest = await page.goto(url.toString(), {
    timeout: timeout * 1000,
    waitUntil: "commit",
  });
  assert(navRequest);

  log.info(`Arrived at url="${page.url()}"`);
  log.info(`Letting page load for "${String(seconds)}" seconds`);
  await page.waitForTimeout(seconds * 1000);

  for (const aMeasurer of measurers.values()) {
    log.verbose("Closing measurements for: ", aMeasurer.type);
    aMeasurer.close();
  }

  const eventDrainTimeMs: number = 5 * 1000;
  log.verbose(
    `Waiting "${String(eventDrainTimeMs)}ms" for events 'in-the-air' to ` +
      "complete. (Note, they are not include in measurement amounts)",
  );
  await page.waitForTimeout(eventDrainTimeMs);

  const results = {} as Record<MeasurementType, MeasurementResult | null>;
  const numMeasurements = measurers.size.toString();
  let measurementIndex = 0;
  for (const [aMeasurementType, aMeasurer] of measurers.entries()) {
    measurementIndex += 1;
    const prefix = `(${measurementIndex.toString()}/${numMeasurements}) `;
    log.info(prefix, `Collecting measurement "${aMeasurementType}"`);
    results[aMeasurementType] = await aMeasurer.collect();
  }

  log.info("closing browser");
  await context.close();
  return {
    end: new Date(),
    measurements: results,
    start: startTime,
    url: url,
    version: await getVersion(),
  };
};
