import assert from "node:assert/strict";
import { exec, spawn } from "node:child_process";
import { EOL } from "node:os";
import psTree from "ps-tree";
import { BaseMeasurer } from "./structure/base.js";
import { MeasurementType } from "../types.js";
import { canDropSudoLevels, dropSudoLevels } from "../utils.js";
const powerUtil = "powermetrics";
const samplingInterval = "350";
const sampleEnd = "ALL_TASKS ";
const headerRegex = /Name[ ]+(?<id_col>ID[ ]+).*(?<gpu_col>GPU ms\/s[ ]+)Energy Impact/d;
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
        const idValue = parseInt(line.substring(idColWidth[0], idColWidth[1]), 10);
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
    static async validate(config) {
        return new Promise((resolve, reject) => {
            // Just a throw-away quick-run set of commands to test if we can
            // run the tool at all.
            exec(`${powerUtil} -n 1 -i 100`, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (config.shouldDropPermissions && !canDropSudoLevels()) {
                    const err = new Error("Unable to automatically drop permission, could not find ENV " +
                        `variables SUDO_UID='${String(process.env.SUDO_UID)}' and ` +
                        `SUDO_GID='${String(process.env.SUDO_GID)}'.`);
                    reject(err);
                }
                else {
                    resolve(undefined);
                }
            });
        });
    }
    constructor(logger, url, context, config) {
        super(logger, url, context, config);
        this.#browserPids = new Map();
        this.#datapoints = new Map();
    }
    async beforeLaunch() {
        const powerUtilArgs = [
            "-i",
            samplingInterval,
            "--samplers",
            "tasks",
            "--show-process-energy",
            "--show-process-gpu",
        ];
        return new Promise((resolve, reject) => {
            const childProcess = spawn(powerUtil, powerUtilArgs);
            childProcess.stdout.on("data", (data) => {
                let frameParser;
                const parts = String(data).split(EOL);
                for (const aLine of parts) {
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
            if (!childProcess.pid) {
                const msg = `Error launching: ${powerUtil} ` + powerUtilArgs.join(" ");
                reject(new Error(msg));
                return;
            }
            this.#powermetricsProcess = childProcess;
            if (this.config.shouldDropPermissions) {
                this.logVerbose("About to drop permissions...");
                const dropResult = dropSudoLevels();
                if (!dropResult?.success) {
                    reject(new Error("Error dropping permissions"));
                    return;
                }
                this.logVerbose("...successfully dropped. From " +
                    `UID='${String(dropResult.prev.uid)}', ` +
                    `GID='${String(dropResult.prev.gid)}` +
                    ` to UID='${String(dropResult.current.uid)}', ` +
                    `GID='${String(dropResult.current.uid)}'`);
            }
            resolve(undefined);
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
                for (const aChildPoint of children) {
                    const aChild = aChildPoint;
                    const childPid = parseInt(aChild.PID, 10);
                    if (childPid === powermetricsPid) {
                        continue;
                    }
                    const parentPid = parseInt(aChild.PPID, 10);
                    if (parentPid in powermetricsPids) {
                        powermetricsPids.add(childPid);
                        continue;
                    }
                    this.#browserPids.set(childPid, aChild.COMM);
                }
                if (this.#browserPids.size === 0) {
                    this.logError("Could not find the process ids for the browser.");
                    this.logError("Child processes: ", children);
                    reject(new Error("Could not find browser process id(s)"));
                    return;
                }
                resolve(super.close());
            });
        });
    }
    collect() {
        const processTotals = {};
        let powerTotal = 0.0;
        let gpuTotal = 0.0;
        for (const [aPid, processName] of this.#browserPids.entries()) {
            // for (const [aPid, datapoints] of this.#datapoints.entries()) {
            const processTotal = {
                pid: aPid,
                command: processName,
                energy: 0,
                gpu: 0,
            };
            const datapoints = this.#datapoints.get(aPid);
            if (datapoints) {
                for (const aDatapoint of datapoints) {
                    processTotal.energy += aDatapoint.energy;
                    processTotal.gpu += aDatapoint.gpu;
                }
                processTotals[aPid] = processTotal;
                powerTotal += processTotal.energy;
                gpuTotal += processTotal.gpu;
            }
        }
        const result = {
            type: MeasurementType.Power,
            data: {
                processes: processTotals,
                totals: {
                    power: powerTotal,
                    gpu: gpuTotal,
                },
            },
        };
        return Promise.resolve(result);
    }
}
//# sourceMappingURL=power.js.map