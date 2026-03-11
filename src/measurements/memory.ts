import psTree, { PS } from "ps-tree";

import { BaseMeasurer, MeasurementResult } from "./base.js";
import { MeasurementType } from "../types.js";

export class MemoryMeasurer extends BaseMeasurer {
  readonly type = MeasurementType.Memory;

  collect(): Promise<MeasurementResult | null> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      psTree(process.pid, (error: Error | null, children: readonly PS[]) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(null);
      });
    });
  }
}
