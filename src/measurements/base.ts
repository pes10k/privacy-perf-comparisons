import { BrowserContext } from "@playwright/test";

import { LogFunc, Logger } from "../logging.js";
import { MeasurementType } from "../types.js";

export interface MeasurementResult {
  type: MeasurementType;
  data: unknown;
}

export class BaseMeasurer {
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
    this.instrument();
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

  measurementType(): MeasurementType {
    throw new Error("Method not implemented");
  }

  instrument() {
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async collect(): Promise<MeasurementResult | null> {
    throw new Error("Method not implemented");
  }
}
