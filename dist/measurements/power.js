import assert from "node:assert/strict";
import { exec, spawn } from "node:child_process";
import { EOL } from "node:os";
import psTree from "ps-tree";
import { BaseMeasurer } from "./structure/base.js";
import { MeasurementType } from "../types.js";
const powerUtil = "powermetrics";
const sampleEnd = "ALL_TASKS ";
const headerRegex = /Name[ ]+(<id_col>ID[ ]+).*(<gpu_col>GPU ms\/s[ ]+)Energy Impact/d;
const isEndOfSample = (line) => {
    return line.startsWith(sampleEnd);
};
const buildFrameParser = (line) => {
    const match = headerRegex.exec(line);
    if (match === null) {
        return;
    }
    const indices = match.indices;
    assert(indices);
    assert(indices[1]);
    const idColWidth = indices[1];
    assert(indices[2]);
    const gpuColWidth = indices[2];
    const energyColWidth = [indices[2][1] + 1, undefined];
    return (line) => {
        if (isEndOfSample(line)) {
            return undefined;
        }
        const idValue = parseInt(line.substring(0, idColWidth[1]), 10);
        const gpuText = line.substring(gpuColWidth[0], gpuColWidth[1]);
        const gpuValue = Number.parseFloat(gpuText);
        const energyText = line.substring(energyColWidth[0]);
        const energyValue = Number.parseFloat(energyText);
        return {
            pid: idValue,
            energy: energyValue,
            gpu: gpuValue,
        };
    };
};
export class PowerMeasurer extends BaseMeasurer {
    type = MeasurementType.Power;
    #browserPids;
    #datapoints;
    #powermetricsProcess;
    static async validate() {
        return new Promise((resolve, reject) => {
            exec(`${powerUtil} -n 1 -i 100`, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(undefined);
            });
        });
    }
    constructor(logger, url, context) {
        super(logger, url, context);
        this.#browserPids = new Map();
        this.#datapoints = new Map();
    }
    async beforeLaunch() {
        const powerUtilArgs = [
            "-i",
            "500",
            "--samplers",
            "tasks",
            "--show-process-energy",
            "--show-process-gpu",
        ];
        return new Promise((resolve, reject) => {
            const childProcess = spawn(powerUtil, powerUtilArgs);
            childProcess.stdout.on("data", (data) => {
                let frameParser;
                for (const aLine of data.split(EOL)) {
                    if (!frameParser) {
                        frameParser = buildFrameParser(aLine);
                        continue;
                    }
                    const datapoint = frameParser(aLine);
                    // If we had a frame parser, but didn't get a datapoint back,
                    // then it means we hit the end of the data frame, and so need
                    // to discard the existing frameParser and keep reading.
                    if (!datapoint) {
                        frameParser = undefined;
                        continue;
                    }
                    // Else if we did get a datapoint back, but haven't seen this pid
                    // before, then we create a new array to contain datapoints
                    // for this pid. Otherwise, append the datapoint to the existing
                    // array.
                    const datapointArray = this.#datapoints.get(datapoint.pid);
                    if (datapointArray) {
                        datapointArray.push(datapoint);
                    }
                    else {
                        this.#datapoints.set(datapoint.pid, [datapoint]);
                    }
                }
            });
            if (childProcess.pid) {
                this.#powermetricsProcess = childProcess;
                resolve(undefined);
            }
            else {
                const msg = `Error launching: ${powerUtil} ` + powerUtilArgs.join(" ");
                reject(new Error(msg));
            }
        });
    }
    // When closing this measurement probe, capture all the process ids
    // related to the browser being tested.
    async close() {
        const powermetricsPids = new Set();
        assert(this.#powermetricsProcess);
        const powermetricsPid = this.#powermetricsProcess.pid;
        assert(powermetricsPid);
        powermetricsPids.add(powermetricsPid);
        this.#powermetricsProcess.kill();
        return new Promise((resolve, reject) => {
            psTree(process.pid, (err, children) => {
                if (err) {
                    this.logError(`no child processes for pid: ${String(process.pid)}`);
                    reject(err);
                    return;
                }
                for (const aChild of children) {
                    const childPid = parseInt(aChild.PID, 10);
                    if (childPid === powermetricsPid) {
                        continue;
                    }
                    const parentPid = parseInt(aChild.PPID, 10);
                    if (parentPid in powermetricsPids) {
                        powermetricsPids.add(childPid);
                        continue;
                    }
                    this.#browserPids.set(childPid, aChild.COMMAND);
                }
                if (this.#browserPids.size === 0) {
                    this.logError("Could not find the process ids for the browser.");
                    this.logError("Child processes: ", children.map((x) => x.COMMAND));
                    reject(new Error("Could not find browser process id(s)"));
                    return;
                }
                resolve(super.close());
            });
        });
    }
    collect() {
        throw new Error("Method not implemented.");
    }
}
//# sourceMappingURL=power.js.map