import { BrowserContext } from "@playwright/test";

import { LogFunc, Logger } from "../../logging.js";
import { MeasurementType, RunConfig } from "../../types.js";

export interface MeasurementResult {
  type: MeasurementType;
  data: unknown;
}

export interface BaseMeasurerChild {
  new (
    logger: Logger,
    url: URL,
    context: BrowserContext,
    config: RunConfig,
  ): BaseMeasurer;
  validate(config: RunConfig): Promise<undefined>;
}

export type MeasurerStepSignature = Promise<undefined> | Promise<MeasurementResult | null> | Promise<boolean>

export abstract class BaseMeasurer {
  abstract readonly type: MeasurementType;

  readonly config: RunConfig;
  readonly context: BrowserContext;
  readonly logger: Logger;
  readonly url: URL;

  isContextClosed = false;
  instrumentedAt?: Date;
  closedAt?: Date;

  // Method child classes can implement to perform any validation
  // logic needed to make sure the requested measurements can be performed.
  // If there is a validation error (i.e., the requested tests cannot be
  // run), then child classes should throw an exception explaining why.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async validate(config: RunConfig): Promise<undefined> {
    // pass
  }

  constructor(
    logger: Logger,
    url: URL,
    context: BrowserContext,
    config: RunConfig
  ) {
    this.config = config;
    this.logger = logger;
    this.url = url;
    this.context = context;
  }

  logInfo(...msg: unknown[]) {
    this.#log(this.logger.info, ...msg);
  }

  logVerbose(...msg: unknown[]) {
    this.#log(this.logger.verbose, ...msg);
  }

  logError(...msg: unknown[]) {
    this.#log(this.logger.error, ...msg);
  }

  #log(logFunc: LogFunc, ...msg: unknown[]) {
    logFunc.call(
      this.logger,
      "MEASURER:",
      this.type.toUpperCase(),
      ": ",
      ...msg,
    );
  }

  // Method that gets called before launching the browser, and so for setting
  // up anything that needs to be in place before the browser runs.
  async beforeLaunch(): Promise<undefined> {
    // pass
  }

  abstract collect(): Promise<MeasurementResult | null>;

  // Method thats called on all base classes after the browser is setup
  // and prepared an its initial state, meaning its its loaded, and (unless
  // --preserve-page has been specified) all tabs and pages have been closed.
  // Child classes can implement this if there is some behavior they need
  // to do *before* we start loading the target URL for the page measurement.
  async beforeStart(): Promise<undefined> {
    // pass
  }

  // Method thats called on all base classes indicating that we've started
  // loading the target page. Everything that happens between this method
  // being called, and the "close" method being called is happening
  // while the target webpage is being loaded and executed.
  async start(): Promise<undefined> {
    // pass
  }

  async instrumentContext(): Promise<undefined> {
    this.context.on("close", () => {
      this.isContextClosed = true;
    });

    if (this.instrumentedAt) {
      throw new Error(
        "Trying to instrument a measurer instance after it " +
          `was instrumented at "${this.instrumentedAt.toISOString()}"`,
      );
    }
    this.instrumentedAt = new Date();
  }

  async close(): Promise<boolean> {
    if (this.closedAt) {
      this.logError(
        "Tried to close measurement, but it was already closed at ",
        this.closedAt.toISOString(),
      );
      return false;
    }
    this.closeIfOpen();
    return true;
  }

  closeIfOpen(): boolean {
    if (this.closedAt) {
      return false;
    }
    this.closedAt = new Date();
    this.logVerbose("Ending measurement at ", this.closedAt.toISOString());
    return true;
  }
}
