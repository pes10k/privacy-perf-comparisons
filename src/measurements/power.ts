import { spawn } from "node:child_process";

import { MeasurementType, RunConfig } from "../types.js";
import { BaseMeasurer, MeasurementResult } from "./structure/base.js";

export class PowerMeasurer extends BaseMeasurer {
  readonly type = MeasurementType.Power;

  static async validate(config: RunConfig): Promise<undefined> {
    return new Promise((resolve, reject) => {});
  }

  collect(): Promise<MeasurementResult | null> {
    throw new Error("Method not implemented.");
  }
}
