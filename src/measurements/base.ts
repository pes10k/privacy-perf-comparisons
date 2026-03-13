import { BrowserContext } from "@playwright/test";

import { LogFunc, Logger } from "../logging.js";
import { MeasurementType } from "../types.js";

export interface MeasurementResult {
  type: MeasurementType;
  data: unknown;
}

export type BaseMeasurerChild = new (
  logger: Logger,
  url: URL,
  context: BrowserContext,
) => BaseMeasurer;

export abstract class BaseMeasurer {
  abstract readonly type: MeasurementType;

  readonly logger: Logger;
  readonly url: URL;
  readonly context: BrowserContext;

  isContextClosed = false;
  instrumentedAt?: Date;
  closedAt?: Date;

  constructor(logger: Logger, url: URL, context: BrowserContext) {
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
  start(): undefined {
    // pass
  }

  instrumentContext() {
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

  close(): boolean {
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
