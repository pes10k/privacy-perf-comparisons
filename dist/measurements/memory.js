import psTree from "ps-tree";
import { BaseMeasurer } from "./base.js";
import { MeasurementType } from "../types.js";
export class MemoryMeasurer extends BaseMeasurer {
    type = MeasurementType.Memory;
    collect() {
        return new Promise((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            psTree(process.pid, (error, children) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(null);
            });
        });
    }
}
//# sourceMappingURL=memory.js.map