import assert from "node:assert";
import { EOL } from "node:os";
export const isDebugMode = () => {
    return process.env.PERF_TESTS_DEBUG === "1";
};
export const indent = (text, prefix = "  ") => {
    return text
        .split(EOL)
        .map((x) => prefix + x)
        .join(EOL);
};
let hasPosixIds_;
const hasPosixIds = (proc) => {
    if (hasPosixIds_ !== undefined) {
        return hasPosixIds_;
    }
    hasPosixIds_ =
        process.geteuid !== undefined &&
            process.seteuid !== undefined &&
            process.getegid !== undefined &&
            process.setegid !== undefined;
    return hasPosixIds_;
};
const posixIds = () => {
    if (!hasPosixIds(process)) {
        return undefined;
    }
    return {
        uid: process.geteuid(),
        gid: process.getegid(),
    };
};
export const canDropSudoLevels = () => {
    if (!hasPosixIds(process)) {
        return undefined;
    }
    if (process.env.SUDO_UID === undefined ||
        process.env.SUDO_GID === undefined) {
        return false;
    }
    return true;
};
export const dropSudoLevels = () => {
    if (!hasPosixIds(process)) {
        return undefined;
    }
    const prevLevels = posixIds();
    assert(prevLevels);
    assert(process.env.SUDO_UID);
    assert(process.env.SUDO_GID);
    const target_uid = parseInt(process.env.SUDO_UID, 10);
    const target_gid = parseInt(process.env.SUDO_GID, 10);
    process.setegid(target_gid);
    process.seteuid(target_uid);
    const currentLevels = posixIds();
    assert(currentLevels);
    const wasSuccessful = prevLevels.uid !== currentLevels.uid ||
        prevLevels.gid !== currentLevels.gid;
    return {
        success: wasSuccessful,
        prev: prevLevels,
        current: currentLevels,
    };
};
//# sourceMappingURL=utils.js.map