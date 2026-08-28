import { MeasurementType } from "../types.js";
import { BaseMeasurer } from "./structure/base.js";
export class PowerMeasurer extends BaseMeasurer {
    type = MeasurementType.Power;
    static async validate(config) {
        return new Promise((resolve, reject) => { });
    }
    collect() {
        throw new Error("Method not implemented.");
    }
}
//# sourceMappingURL=power.js.map