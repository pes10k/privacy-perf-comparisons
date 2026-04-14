import pidusage from "pidusage";
import psTree, { PS } from "ps-tree";

import { BaseMeasurer, MeasurementResult } from "./base.js";
import { MeasurementType } from "../types.js";
import { Logger } from "../logging.js";
import { BrowserContext } from "@playwright/test";

type PID = number;
type DatapointType = "before" | "during" | "end";

export interface ProcessDatapoint {
  // The process id for the process, as it appears in the PID column of 'ps'.
  pid: PID;
  // The memory used by this process, as it appears in the RSS column of 'ps'.
  mem: number;
  // The CPU% used by this process, as it appears in the CPU% column of 'ps'.
  cpu: number;
}

export interface Datapoint {
  // Total memory use represented in this datapoint (i.e., summing the "amount"
  // values from each ProcessDatapoint).
  totals: {
    memory: number;
    cpu: number;
  };
  processes: ProcessDatapoint[];
  type: DatapointType;
  time: Date;
}

const processUsage = async (pid: PID): Promise<ProcessDatapoint> => {
  return new Promise((resolve, reject) => {
    pidusage(pid, (error: Error | null, stats) => {
      if (error) {
        reject(error);
        return;
      }
      const procDatapoint: ProcessDatapoint = {
        pid: pid,
        mem: stats.memory,
        cpu: stats.cpu,
      };
      resolve(procDatapoint);
    });
  });
};

const processTreeUsage = async (
  logger: Logger,
  pid: PID,
): Promise<ProcessDatapoint[]> => {
  const log = logger.prefixedLogger("processTreeUsage(): ");
  return new Promise((resolve, reject) => {
    log.debug("Fetching psTree for pid: ", pid);
    psTree(pid, (error: Error | null, children: readonly PS[]) => {
      if (error) {
        log.debug("no child processes for pid: ", pid);
        reject(error);
        return;
      }

      log.debug("num child processes for pid: ", pid, ", ", children.length);
      const childDataPromises: Promise<ProcessDatapoint>[] = [];
      const childDataPids: PID[] = [];
      for (const aChild of children) {
        let childPid: undefined | PID;
        try {
          childPid = parseInt(aChild.PID, 10);
        } catch {
          log.error(`Invalid PID, could not parse as int: "${aChild.PID}"`);
          continue;
        }
        childDataPromises.push(processUsage(childPid));
        childDataPids.push(childPid);
      }

      let numReject = 0;
      Promise.allSettled(childDataPromises)
        .then((results) => {
          let index = 0;
          const numResults = results.length;
          const childDataPoints: ProcessDatapoint[] = [];
          for (const aResult of results) {
            const aPid = childDataPids[index];
            index += 1;
            const prefix = `(${index.toString()}/${numResults.toString()}) `;
            if (aResult.status === "rejected") {
              log.debug(prefix, "Error receiving usage data for pid: ", aPid);
              log.debug(aResult.reason);
            } else {
              numReject += 1;
              log.debug(prefix, "Received usage data for pid: ", aPid);
              childDataPoints.push(aResult.value);
            }
          }
          resolve(childDataPoints);
        })
        .catch((error: unknown) => {
          // We expect there to always be a single rejection, which will
          // be the ps process trying to get information on itself.
          // So we only propagate the error if we had more than one rejection.
          if (numReject > 1) {
            if (error instanceof Error) {
              reject(error);
            } else {
              const errMsg =
                "Unexpected # of child mem use rejections: " +
                numReject.toString();
              reject(new Error(errMsg));
            }
          }
        });
    });
  });
};

const getDatapoint = async (
  logger: Logger,
  pid: PID,
  type: DatapointType,
): Promise<Datapoint> => {
  const subLog = logger.prefixedLogger("getDatapoint(): ");
  subLog.verbose("fetching memory usage for pid=", pid);
  const childDatapoints = await processTreeUsage(logger, pid);
  subLog.debug("num successful datapoints: ", childDatapoints.length);

  let memoryTotal = 0;
  let cpuTotal = 0;
  for (const aDatapoint of childDatapoints) {
    memoryTotal += aDatapoint.mem;
    cpuTotal += aDatapoint.cpu;
  }

  const datapoint: Datapoint = {
    totals: {
      memory: memoryTotal,
      cpu: cpuTotal,
    },
    processes: childDatapoints,
    time: new Date(),
    type: type,
  };
  return datapoint;
};

export class MemoryCPUMeasurer extends BaseMeasurer {
  // Interval for how often to take memory measurements once we've started
  // "the experiment" (i.e., loading the webpage).
  static intervalMs = 5000;

  readonly type = MeasurementType.MemoryCPU;
  readonly #pid: PID;
  readonly #measurements: Datapoint[] = [];

  #intervalId?: NodeJS.Timeout = undefined;

  constructor(logger: Logger, url: URL, context: BrowserContext) {
    super(logger, url, context);
    this.#pid = process.pid;
  }

  async beforeStart(): Promise<undefined> {
    const log = this.logger.prefixedLogger("MemoryCPUMeasurer:beforeStart(): ");
    const datapoint = await getDatapoint(log, this.#pid, "before");
    this.#measurements.push(datapoint);
  }

  start(): undefined {
    const logger = this.logger.prefixedLogger("MemoryCPUMeasurer:start(): ");
    this.#intervalId = setInterval(() => {
      getDatapoint(logger, this.#pid, "during")
        .then((x) => {
          this.#measurements.push(x);
        })
        .catch((err: unknown) => {
          this.logError(err);
        });
    }, MemoryCPUMeasurer.intervalMs);
  }

  close(): boolean {
    if (!this.#intervalId) {
      throw new Error("MemoryCPUMeasurer: closed measurer that wasn't started");
    }
    clearInterval(this.#intervalId);
    return super.close();
  }

  async collect(): Promise<MeasurementResult | null> {
    const logger = this.logger.prefixedLogger("MemoryCPUMeasurer:collect(): ");
    const datapoint = await getDatapoint(logger, this.#pid, "end");
    this.#measurements.push(datapoint);
    return {
      type: this.type,
      data: this.#measurements,
    };
  }
}
