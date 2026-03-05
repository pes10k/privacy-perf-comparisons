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

export type AttachMeasurerFunc = (
  logger: Logger,
  url: URL,
  context: BrowserContext,
) => BaseMeasurer;

export abstract class BaseMeasurer {
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
      this.measurementType().toUpperCase(),
      ": ",
      ...msg,
    );
  }

  abstract measurementType(): MeasurementType;
  abstract collect(): Promise<MeasurementResult | null>;

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
        "Tried to close measurement, but it was already " + "closed at ",
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
