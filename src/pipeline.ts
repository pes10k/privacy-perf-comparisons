import { assert } from "node:console";

import { BrowserContext } from "@playwright/test";

import { Logger } from "./logging.js";
import {
  BaseMeasurer,
  MeasurementResult,
  MeasurerStepSignature,
} from "./measurements/structure/base.js";
import { classForType } from "./measurements/structure/mapping.js";
import { MeasurementType, Report, RunConfig } from "./types.js";
import { getVersion } from "./config.js";

type MethodNames<T> = {
  [K in keyof T]: T[K] extends () => MeasurerStepSignature ? K : never;
}[keyof T];

type PipelineStepName = NonNullable<MethodNames<BaseMeasurer>>;
const PipelineStep = {
  BeforeLaunch: "beforeLaunch",
  InstrumentContext: "instrumentContext",
  BeforeStart: "beforeStart",
  Start: "start",
  Close: "close",
  Collect: "collect",
} as const;

type PipelineResults = Partial<
  Record<MeasurementType, MeasurementResult | null>
>;

const eventDrainTimeMs: number = 5 * 1000;

export class Pipeline {
  readonly #config: RunConfig;
  readonly #context: BrowserContext;
  readonly #logger: Logger;
  readonly #measurers: Partial<Record<MeasurementType, BaseMeasurer>>;
  readonly #numMeasurements: number;

  constructor(logger: Logger, context: BrowserContext, config: RunConfig) {
    this.#config = JSON.parse(JSON.stringify(config)) as RunConfig;
    this.#context = context;
    this.#logger = logger.prefixedLogger("Pipeline:");
    this.#measurers = {};
    this.#numMeasurements = config.measurements.length;
  }

  async measure(url: URL): Promise<Report> {
    const log = this.#logger;

    // Unless we're preserving existing pages, we need to force things to
    // start in a clean profile by closing all open pages, and then
    // re-enabling networking .
    if (!this.#config.preservePages) {
      await this.#closePages();
    }

    for (const aMeasurementType of this.#config.measurements) {
      const measurerType = classForType(aMeasurementType);
      const measurer = new measurerType(
        this.#logger,
        url,
        this.#context,
        this.#config,
      );
      this.#measurers[aMeasurementType] = measurer;
    }

    await this.#runStep(PipelineStep.BeforeLaunch);
    await this.#runStep(PipelineStep.InstrumentContext);
    await this.#runStep(PipelineStep.BeforeStart);
    await this.#runStep(PipelineStep.Start);

    log.verbose("Creating empty page (i.e., new tab).");
    const page = await this.#context.newPage();

    const startTime = new Date();
    log.info(`Navigating to url="${page.url()}"`);
    const navRequest = await page.goto(url.toString(), {
      timeout: this.#config.timeout * 1000,
      waitUntil: "commit",
    });
    assert(navRequest);

    log.info(`Arrived at url="${page.url()}"`);
    log.verbose(`Page load for "${String(this.#config.seconds)}" seconds`);
    await page.waitForTimeout(this.#config.seconds * 1000);

    await this.#runStep(PipelineStep.Close);
    await page.waitForTimeout(eventDrainTimeMs);

    const results = await this.#runStep(PipelineStep.Collect);
    await this.#context.close();
    return {
      end: new Date(),
      measurements: results,
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

  async #runStep(stepName: PipelineStepName): Promise<PipelineResults> {
    const logger = this.#logger.prefixedLogger(`runStep:${stepName}: `);
    logger.verbose(`Starting step ${stepName}`);

    const stepPromises: MeasurerStepSignature[] = [];
    for (const aMeasurer of Object.values(this.#measurers)) {
      logger.debug(` - Starting ${aMeasurer.type}`);
      const measureStepMethod = aMeasurer[stepName].bind(aMeasurer);
      assert(typeof measureStepMethod === "function");
      stepPromises.push(measureStepMethod());
    }
    logger.verbose(`Ending step ${stepName}`);

    const orderedResults = await Promise.all(stepPromises);
    const results: PipelineResults = {};
    for (let i = 0; i < this.#numMeasurements; i += 1) {
      const aType = this.#config.measurements[i];
      const aResult =
        orderedResults[i] === null
          ? null
          : (orderedResults[i] as MeasurementResult);
      results[aType] = aResult;
    }
    return results;
  }
}
