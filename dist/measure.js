import assert from "node:assert/strict";
import { NetworkMeasurer } from "./measurements/network.js";
import { TimingMeasurer } from "./measurements/timing.js";
import { MeasurementType } from "./types.js";
const measurerTypeToClassMap = {
    [MeasurementType.Network]: NetworkMeasurer,
    [MeasurementType.Timing]: TimingMeasurer,
};
export const measureURL = async (logger, context, url, seconds, timeout, measurements) => {
    // Create and instantiate any measurement classes that were requested
    const measurers = new Map();
    for (const aMeasurementType of measurements) {
        const aMeasurerType = measurerTypeToClassMap[aMeasurementType];
        const aMeasurer = new aMeasurerType(logger, url, context);
        aMeasurer.instrumentContext();
        measurers.set(aMeasurementType, aMeasurer);
    }
    const page = await context.newPage();
    const startTime = new Date();
    logger.info(`Navigating to url="${page.url()}"`);
    const navRequest = await page.goto(url.toString(), {
        timeout: timeout * 1000,
        waitUntil: "commit",
    });
    assert(navRequest);
    logger.info(`Arrived at url="${page.url()}"`);
    logger.info(`Letting page load for "${String(seconds)}" seconds`);
    await page.waitForTimeout(seconds * 1000);
    for (const aMeasurer of measurers.values()) {
        aMeasurer.close();
    }
    await page.waitForTimeout(5 * 1000);
    const results = {};
    for (const [aMeasurementType, aMeasurer] of measurers.entries()) {
        results[aMeasurementType] = await aMeasurer.collect();
    }
    await context.close();
    return {
        end: new Date(),
        measurements: results,
        start: startTime,
        url: url,
    };
};
//# sourceMappingURL=measure.js.map