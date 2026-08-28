import { MemoryCPUMeasurer } from "./../memory-cpu.js";
import { NetworkMeasurer } from "./../network.js";
import { PowerMeasurer } from "./../power.js";
import { TimingMeasurer } from "./../timing.js";
import { MeasurementType } from "../../types.js";
const measurerTypeToClassMap = {
    [MeasurementType.MemoryCPU]: MemoryCPUMeasurer,
    [MeasurementType.Network]: NetworkMeasurer,
    [MeasurementType.Power]: PowerMeasurer,
    [MeasurementType.Timing]: TimingMeasurer,
};
export const classForType = (type) => {
    return measurerTypeToClassMap[type];
};
//# sourceMappingURL=mapping.js.map