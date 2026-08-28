import { assert } from "node:console";
import { classForType } from "./measurements/structure/mapping.js";
import { getVersion } from "./config.js";
const PipelineStep = {
    InstrumentContext: "instrumentContext",
    BeforeStart: "beforeStart",
    Start: "start",
    Close: "close",
    Collect: "collect",
};
export class Pipeline {
    #context;
    #logger;
    #measurementTypes;
    #measurers;
    #numMeasurements;
    #preservePages;
    #seconds;
    #timeout;
    constructor(logger, context, config) {
        this.#context = context;
        this.#logger = logger.prefixedLogger("Pipeline:");
        this.#measurementTypes = config.measurements;
        this.#measurers = {};
        this.#numMeasurements = config.measurements.length;
        this.#preservePages = config.preservePages;
        this.#seconds = config.seconds;
        this.#timeout = config.timeout;
    }
    async measure(url) {
        // Unless we're preserving existing pages, we need to force things to
        // start in a clean profile by closing all open pages, and then
        // re-enabling networking .
        if (!this.#preservePages) {
            await this.#closePages();
        }
        for (const aMeasurementType of this.#measurementTypes) {
            const measurerType = classForType(aMeasurementType);
            const measurer = new measurerType(this.#logger, url, this.#context);
            this.#measurers[aMeasurementType] = measurer;
        }
        await this.#runStep(PipelineStep.InstrumentContext);
        await this.#runStep(PipelineStep.BeforeStart);
        await this.#runStep(PipelineStep.Start);
        const log = this.#logger;
        log.verbose("Creating empty page (i.e., new tab).");
        const page = await this.#context.newPage();
        const startTime = new Date();
        log.info(`Navigating to url="${page.url()}"`);
        const navRequest = await page.goto(url.toString(), {
            timeout: this.#timeout * 1000,
            waitUntil: "commit",
        });
        assert(navRequest);
        log.info(`Arrived at url="${page.url()}"`);
        log.info(`Letting page load for "${String(this.#seconds)}" seconds`);
        await page.waitForTimeout(this.#seconds * 1000);
        await this.#runStep(PipelineStep.Close);
        const eventDrainTimeMs = 5 * 1000;
        log.verbose(`Waiting "${String(eventDrainTimeMs)}ms" for events 'in-the-air' to ` +
            "complete. (Note, they are not include in measurement amounts)");
        await page.waitForTimeout(eventDrainTimeMs);
        const collectResults = await this.#runStep(PipelineStep.Collect);
        await this.#context.close();
        return {
            end: new Date(),
            measurements: collectResults,
            start: startTime,
            url: url,
            version: await getVersion(),
        };
    }
    async #closePages() {
        const logger = this.#logger.prefixedLogger("closePages(): ");
        const prevPages = this.#context.pages();
        const numPrevPages = prevPages.length;
        logger.verbose(`pages from previous session: ${numPrevPages.toString()}`);
        for (const aPage of prevPages) {
            const pageUrl = aPage.url();
            logger.verbose("closing page: " + pageUrl);
            await aPage.close();
            logger.verbose("page closed: " + pageUrl);
        }
        logger.verbose("Re-enabling network for context.");
        await this.#context.setOffline(false);
        logger.verbose("Networking re-enabled.");
    }
    async #runStep(stepName) {
        const logger = this.#logger.prefixedLogger(`runStep:${stepName}: `);
        logger.verbose("Start");
        const stepPromises = [];
        for (const aMeasurer of Object.values(this.#measurers)) {
            const measureStepMethod = aMeasurer[stepName];
            assert(typeof measureStepMethod === "function");
            stepPromises.push(measureStepMethod());
        }
        logger.verbose("End");
        const orderedResults = await Promise.all(stepPromises);
        const results = {};
        for (let i = 0; i < this.#numMeasurements; i += 1) {
            const aType = this.#measurementTypes[i];
            const aResult = orderedResults[i] === null
                ? null
                : orderedResults[i];
            results[aType] = aResult;
        }
        return results;
    }
}
//# sourceMappingURL=pipeline.js.map