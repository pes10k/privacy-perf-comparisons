import { BaseMeasurerChild } from "./base.js";
import { MemoryCPUMeasurer } from "./../memory-cpu.js";
import { NetworkMeasurer } from "./../network.js";
import { PowerMeasurer } from "./../power.js";
import { TimingMeasurer } from "./../timing.js";
import { MeasurementType } from "../../types.js";

const measurerTypeToClassMap: Record<MeasurementType, BaseMeasurerChild> = {
  [MeasurementType.MemoryCPU]: MemoryCPUMeasurer,
  [MeasurementType.Network]: NetworkMeasurer,
  [MeasurementType.Power]: PowerMeasurer,
  [MeasurementType.Timing]: TimingMeasurer,
};

export const classForType = (type: MeasurementType): BaseMeasurerChild => {
  return measurerTypeToClassMap[type]
}
