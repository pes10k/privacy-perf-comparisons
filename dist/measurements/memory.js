import pidusage from "pidusage";
import psTree from "ps-tree";
import { BaseMeasurer } from "./base.js";
import { MeasurementType } from "../types.js";
const processUsage = async (pid) => {
    return new Promise((resolve, reject) => {
        pidusage(pid, (error, stats) => {
            if (error) {
                reject(error);
                return;
            }
            const procDatapoint = {
                pid: pid,
                mem: stats.memory,
            };
            resolve(procDatapoint);
        });
    });
};
const processTreeUsage = async (logger, pid) => {
    const log = logger.prefixedLogger("processTreeUsage(): ");
    return new Promise((resolve, reject) => {
        log.verbose("Fetching psTree for pid: ", pid);
        psTree(pid, (error, children) => {
            if (error) {
                log.verbose("no child processes for pid: ", pid);
                reject(error);
                return;
            }
            log.verbose("num child processes for pid: ", pid, ", ", children.length);
            const childDataPromises = [];
            const childDataPids = [];
            for (const aChild of children) {
                let childPid;
                try {
                    childPid = parseInt(aChild.PID, 10);
                }
                catch {
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
                const childDataPoints = [];
                for (const aResult of results) {
                    const aPid = childDataPids[index];
                    index += 1;
                    const prefix = `(${index.toString()}/${numResults.toString()}) `;
                    if (aResult.status === "rejected") {
                        log.verbose(prefix, "Error receiving usage data for pid: ", aPid);
                        log.verbose(aResult.reason);
                    }
                    else {
                        numReject += 1;
                        log.verbose(prefix, "Received usage data for pid: ", aPid);
                        childDataPoints.push(aResult.value);
                    }
                }
                resolve(childDataPoints);
            })
                .catch((error) => {
                // We expect there to always be a single rejection, which will
                // be the ps process trying to get information on itself.
                // So we only propagate the error if we had more than one rejection.
                if (numReject > 1) {
                    if (error instanceof Error) {
                        reject(error);
                    }
                    else {
                        const errMsg = "Unexpected # of child mem use rejections: " +
                            numReject.toString();
                        reject(new Error(errMsg));
                    }
                }
            });
        });
    });
};
const getDatapoint = async (logger, pid, type) => {
    const subLog = logger.prefixedLogger("getDatapoint(): ");
    subLog.verbose("fetching for pid=", pid);
    const childDatapoints = await processTreeUsage(logger, pid);
    subLog.verbose("num successful datapoints: ", childDatapoints.length);
    let memoryTotal = 0;
    for (const aDatapoint of childDatapoints) {
        memoryTotal += aDatapoint.mem;
    }
    const datapoint = {
        summary: memoryTotal,
        processes: childDatapoints,
        time: new Date(),
        type: type,
    };
    return datapoint;
};
export class MemoryMeasurer extends BaseMeasurer {
    // Interval for how often to take memory measurements once we've started
    // "the experiment" (i.e., loading the webpage).
    static intervalMs = 5000;
    type = MeasurementType.Memory;
    #pid;
    #measurements = [];
    #intervalId = undefined;
    constructor(logger, url, context) {
        super(logger, url, context);
        this.#pid = process.pid;
    }
    async beforeStart() {
        const logger = this.logger.prefixedLogger("MemoryMeasurer:beforeStart(): ");
        const datapoint = await getDatapoint(logger, this.#pid, "before");
        this.#measurements.push(datapoint);
    }
    start() {
        const logger = this.logger.prefixedLogger("MemoryMeasurer:start(): ");
        this.#intervalId = setInterval(() => {
            getDatapoint(logger, this.#pid, "during")
                .then((x) => {
                this.#measurements.push(x);
            })
                .catch((err) => {
                logger.error("WHAT IS THIS");
                logger.error(err);
                this.logError(err);
            });
        }, MemoryMeasurer.intervalMs);
    }
    close() {
        if (!this.#intervalId) {
            throw new Error("MemoryMeasurer: closed measurer that was not started");
        }
        clearInterval(this.#intervalId);
        return super.close();
    }
    async collect() {
        const logger = this.logger.prefixedLogger("MemoryMeasurer:collect(): ");
        const datapoint = await getDatapoint(logger, this.#pid, "end");
        this.#measurements.push(datapoint);
        return {
            type: this.type,
            data: this.#measurements,
        };
    }
}
//# sourceMappingURL=memory.js.map