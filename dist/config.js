import assert from "node:assert/strict";
import { access, constants, mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { BrowserType, MeasurementType } from "./types.js";
import { LoggingLevel } from "./logging.js";
const programName = "privacy-perf-comparisons";
const validSchemes = ["http:", "https:"];
const isPathToExecFile = async (path) => {
    try {
        await access(path, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
};
const isDirReadable = async (...pathSegments) => {
    try {
        await access(join(...pathSegments), constants.R_OK);
        return true;
    }
    catch {
        return false;
    }
};
export const runConfigForArgs = async (args) => {
    assert(args.url instanceof URL);
    if (!validSchemes.includes(args.url.protocol)) {
        throw new Error("Invalid URL. Must contain a http(s) scheme and hostname. Received " +
            `scheme "${args.url.protocol}"`);
    }
    if (!args.url.hostname) {
        throw new Error("Invalid URL. Must contain a hostname. Received " +
            `hostname "${args.url.hostname}"`);
    }
    if (args.seconds <= 0) {
        throw new Error('Invalid "seconds". Must be a positive integer.');
    }
    const isChromium = args.browser === BrowserType.Chromium || args.browser === BrowserType.Brave;
    assert(typeof args.profile === "string");
    assert(typeof args.userDataDir === "string");
    if (args.profile && !isChromium) {
        throw new Error("Invalid profile. Only Chromium browsers support " +
            "multiple profiles in a single user data dir.");
    }
    // Here we check that one of the following conditions are true:
    // 1. the user didn't specify a user-data-dir (in which case we create
    //    a temporary one).
    // 2. the user specified a user-data-dir, and that path is empty (in which
    //    case we rely on the browser to create a new user data dir at the given
    //    path),
    // 3. the user specified
    //    i. NOT chromium AND
    //    ii. the user-data-dir exists
    //      (in which case we use the user-data-dir as the profile directory
    //      itself).
    // 4. the user specified
    //    i. chromium AND
    //    ii. the user-data-dir exists AND
    //    iii. the "profile" name exists as a subdirectory in the user-data-dir
    //      (in which case we have a clearly defined existing profile to use)
    // Any case other than one of the above cases is an error.
    // This is not the most concise way to check these cases, but meant
    // to be the easiest to follow, by matching the above exact criteria
    const isUserDataDirExisting = await isDirReadable(args.userDataDir);
    const isCaseOne = !args.userDataDir;
    const isCaseTwo = !isCaseOne && args.userDataDir && !isUserDataDirExisting;
    const isCaseThree = !isCaseOne && !isCaseTwo && !isChromium && isUserDataDirExisting;
    const isProfileReadable = await isDirReadable(args.userDataDir, args.profile);
    const isCaseFour = !isCaseOne &&
        !isCaseTwo &&
        !isCaseThree &&
        isChromium &&
        isUserDataDirExisting &&
        isProfileReadable;
    let validatedUserDataDir, validatedProfile;
    if (isCaseOne) {
        const tempDirPath = await mkdtempDisposable(join(tmpdir(), programName));
        validatedUserDataDir = tempDirPath.path;
    }
    else if (isCaseTwo || isCaseThree) {
        validatedUserDataDir = args.userDataDir;
    }
    else if (isCaseFour) {
        validatedUserDataDir = join(args.userDataDir, args.profile);
        validatedProfile = args.profile;
    }
    else {
        throw new Error("Invalid user-data-dir config.  Either must specify no " +
            "user-data-dir, or a user-data-dir argument for a directory that " +
            "does not currently exist, or specify a valid user-data-dir (with " +
            "the specified profile as a subdirectory in the user-data-dir if " +
            "chromium).");
    }
    // We only allow the `binary` argument for Chromium-family browsers,
    // since we can do our measurements on the "stock" versions of these.
    // For Gecko and WebKit browsers, these require the playwright patches
    // for our measurements to succeed, and so we necessarily have to use
    // the playwright provided ones.
    let binaryPath;
    // If we weren't passed a path to a browser binary, use the paths to the
    // playwright binaries.
    if (args.binary_path === undefined) {
        switch (args.browser) {
            case BrowserType.Brave:
                throw new Error("Must include a binary path when testing Brave (since " +
                    "playwright does not have a default Brave binary included");
            case BrowserType.Chromium:
                binaryPath = chromium.executablePath();
                break;
            case BrowserType.Gecko:
                binaryPath = firefox.executablePath();
                break;
            case BrowserType.WebKit:
                binaryPath = webkit.executablePath();
                break;
        }
    }
    else {
        assert(typeof args.binary_path === "string");
        switch (args.browser) {
            case BrowserType.Brave:
            case BrowserType.Chromium:
                if (!(await isPathToExecFile(args.binary_path))) {
                    throw new Error(`Invalid binary path. "${args.binary_path}" is not an ` +
                        "executable file.");
                }
                binaryPath = args.binary_path;
                break;
            case BrowserType.Gecko:
            case BrowserType.WebKit:
                throw new Error("Invalid binary path. Unable to use --binary argument " +
                    "with --browser=firefox or gecko, since these tests only work with " +
                    "the playwright-patched versions of these browsers. You can install " +
                    'them with "npm run install-browsers".');
        }
    }
    assert.ok(binaryPath);
    if (args.height <= 0 || args.width <= 0) {
        throw new Error("The height and width of the viewport must both be " +
            " positive values.");
    }
    assert(typeof args.height === "string");
    const viewportHeight = parseInt(args.height, 10);
    assert.notDeepStrictEqual(viewportHeight, NaN);
    assert(typeof args.width === "string");
    const viewportWidth = parseInt(args.width, 10);
    assert.notDeepStrictEqual(viewportWidth, NaN);
    if (args.timeout <= 0) {
        throw new Error("The --timeout argument must be a positive number.");
    }
    else if (args.timeout > 500) {
        throw new Error("You have a very high value for seconds. Note this is " +
            "seconds, not milliseconds.");
    }
    assert(typeof args.timeout === "string");
    const timeoutSeconds = parseInt(args.timeout, 10);
    assert.notDeepStrictEqual(timeoutSeconds, NaN);
    assert(args.browser in BrowserType);
    const browserType = args.browser;
    assert(args.logging in LoggingLevel);
    const loggingLevel = args.logging;
    const measurementTypes = [];
    for (const aMeasurementType of args.measurements) {
        assert(aMeasurementType in MeasurementType);
        measurementTypes.push(aMeasurementType);
    }
    assert(typeof args.seconds === "number");
    return {
        binary: binaryPath,
        browser: browserType,
        loggingLevel: loggingLevel,
        measurements: measurementTypes,
        profile: validatedProfile,
        seconds: args.seconds,
        timeout: timeoutSeconds,
        url: args.url,
        userDataDir: validatedUserDataDir,
        viewport: {
            height: viewportHeight,
            width: viewportWidth,
        },
    };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLE1BQU0sTUFBTSxvQkFBb0IsQ0FBQztBQUN4QyxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDakMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUdqQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFdkQsT0FBTyxFQUFFLFdBQVcsRUFBRSxlQUFlLEVBQW1CLE1BQU0sWUFBWSxDQUFDO0FBQzNFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFFNUMsTUFBTSxXQUFXLEdBQUcsMEJBQTBCLENBQUM7QUFDL0MsTUFBTSxZQUFZLEdBQUcsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFFekMsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLEVBQUUsSUFBVSxFQUFvQixFQUFFO0lBQzlELElBQUksQ0FBQztRQUNILE1BQU0sTUFBTSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxhQUFhLEdBQUcsS0FBSyxFQUFFLEdBQUcsWUFBb0IsRUFBb0IsRUFBRTtJQUN4RSxJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEQsT0FBTyxJQUFJLENBQUM7SUFDZCxD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QUVELE1BQU0sQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUM7SUFFekMsT0FBTztRQUNMLE1BQU0sRUFBRSxVQUFVO1FBQ2xCLE9BQU8sRUFBRSxXQUFXO1FBQ3BCLFlBQVksRUFBRSxZQUFZO1FBQzFCLFlBQVksRUFBRSxnQkFBZ0I7UUFDOUIsT0FBTyxFQUFFLGdCQUFnQjtRQUN6QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87UUFDckIsT0FBTyxFQUFFLGNBQWM7UUFDdkIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1FBQ2IsV0FBVyxFQUFFLG9CQUFvQjtRQUNqQyxRQUFRLEVBQUU7WUFDUixNQUFNLEVBQUUsY0FBYztZQUN0QixLQUFLLEVBQUUsYUFBYTtTQUNyQjtLQUNGLENBQUM7QUFDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgYXNzZXJ0IGZyb20gXCJub2RlOmFzc2VydC9zdHJpY3RcIjtcbmltcG9ydCB7IGFjY2VzcywgY29uc3RhbnRzLCBta2R0ZW1wRGlzcG9zYWJsZSB9IGZyb20gXCJub2RlOmZzL3Byb21pc2VzXCI7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tIFwibm9kZTpvc1wiO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJub2RlOnBhdGhcIjtcblxuaW1wb3J0IHsgTmFtZXNwYWNlIH0gZnJvbSBcImFyZ3BhcnNlXCI7XG5pbXBvcnQgeyBjaHJvbWl1bSwgZmlyZWZveCwgd2Via2l0IH0gZnJvbSBcInBsYXl3cmlnaHRcIjtcblxuaW1wb3J0IHsgQnJvd3NlclR5cGUsIE1lYXN1cmVtZW50VHlwZSwgUGF0aCwgUnVuQ29uZmlnIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcbmltcG9ydCB7IExvZ2dpbmdMZXZlbCB9IGZyb20gXCIuL2xvZ2dpbmcuanNcIjtcblxuY29uc3QgcHJvZ3JhbU5hbWUgPSBcInByaXZhY3ktcGVyZi1jb21wYXJpc29uc1wiO1xuY29uc3QgdmFsaWRTY2hlbWVzID0gW1wiaHR0cDpcIiwgXCJodHRwczpcIl07XG5cbmNvbnN0IGlzUGF0aFRvRXhlY0ZpbGUgPSBhc3luYyAocGF0aDogUGF0aCk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICB0cnkge1xuICAgIGF3YWl0IGFjY2VzcyhwYXRoLCBjb25zdGFudHMuWF9PSyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufTtcblxuY29uc3QgaXNEaXJSZWFkYWJsZSA9IGFzeW5jICguLi5wYXRoU2VnbWVudHM6IFBhdGhbXSk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICB0cnkge1xuICAgIGF3YWl0IGFjY2Vzcyhqb2luKC4uLnBhdGhTZWdtZW50cyksIGNvbnN0YW50cy5SX09LKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgcnVuQ29uZmlnRm9yQXJncyA9IGFzeW5jIChhcmdzOiBOYW1lc3BhY2UpOiBQcm9taXNlPFJ1bkNvbmZpZz4gPT4ge1xuICBhc3NlcnQoYXJncy51cmwgaW5zdGFuY2VvZiBVUkwpO1xuICBpZiAoIXZhbGlkU2NoZW1lcy5pbmNsdWRlcyhhcmdzLnVybC5wcm90b2NvbCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIkludmFsaWQgVVJMLiBNdXN0IGNvbnRhaW4gYSBodHRwKHMpIHNjaGVtZSBhbmQgaG9zdG5hbWUuIFJlY2VpdmVkIFwiICtcbiAgICAgICAgYHNjaGVtZSBcIiR7YXJncy51cmwucHJvdG9jb2x9XCJgLFxuICAgICk7XG4gIH1cblxuICBpZiAoIWFyZ3MudXJsLmhvc3RuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJJbnZhbGlkIFVSTC4gTXVzdCBjb250YWluIGEgaG9zdG5hbWUuIFJlY2VpdmVkIFwiICtcbiAgICAgICAgYGhvc3RuYW1lIFwiJHthcmdzLnVybC5ob3N0bmFtZX1cImAsXG4gICAgKTtcbiAgfVxuXG4gIGlmIChhcmdzLnNlY29uZHMgPD0gMCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBcInNlY29uZHNcIi4gTXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXIuJyk7XG4gIH1cblxuICBjb25zdCBpc0Nocm9taXVtID1cbiAgICBhcmdzLmJyb3dzZXIgPT09IEJyb3dzZXJUeXBlLkNocm9taXVtIHx8IGFyZ3MuYnJvd3NlciA9PT0gQnJvd3NlclR5cGUuQnJhdmU7XG5cbiAgYXNzZXJ0KHR5cGVvZiBhcmdzLnByb2ZpbGUgPT09IFwic3RyaW5nXCIpO1xuICBhc3NlcnQodHlwZW9mIGFyZ3MudXNlckRhdGFEaXIgPT09IFwic3RyaW5nXCIpO1xuICBpZiAoYXJncy5wcm9maWxlICYmICFpc0Nocm9taXVtKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJJbnZhbGlkIHByb2ZpbGUuIE9ubHkgQ2hyb21pdW0gYnJvd3NlcnMgc3VwcG9ydCBcIiArXG4gICAgICAgIFwibXVsdGlwbGUgcHJvZmlsZXMgaW4gYSBzaW5nbGUgdXNlciBkYXRhIGRpci5cIixcbiAgICApO1xuICB9XG5cbiAgLy8gSGVyZSB3ZSBjaGVjayB0aGF0IG9uZSBvZiB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIHRydWU6XG4gIC8vIDEuIHRoZSB1c2VyIGRpZG4ndCBzcGVjaWZ5IGEgdXNlci1kYXRhLWRpciAoaW4gd2hpY2ggY2FzZSB3ZSBjcmVhdGVcbiAgLy8gICAgYSB0ZW1wb3Jhcnkgb25lKS5cbiAgLy8gMi4gdGhlIHVzZXIgc3BlY2lmaWVkIGEgdXNlci1kYXRhLWRpciwgYW5kIHRoYXQgcGF0aCBpcyBlbXB0eSAoaW4gd2hpY2hcbiAgLy8gICAgY2FzZSB3ZSByZWx5IG9uIHRoZSBicm93c2VyIHRvIGNyZWF0ZSBhIG5ldyB1c2VyIGRhdGEgZGlyIGF0IHRoZSBnaXZlblxuICAvLyAgICBwYXRoKSxcbiAgLy8gMy4gdGhlIHVzZXIgc3BlY2lmaWVkXG4gIC8vICAgIGkuIE5PVCBjaHJvbWl1bSBBTkRcbiAgLy8gICAgaWkuIHRoZSB1c2VyLWRhdGEtZGlyIGV4aXN0c1xuICAvLyAgICAgIChpbiB3aGljaCBjYXNlIHdlIHVzZSB0aGUgdXNlci1kYXRhLWRpciBhcyB0aGUgcHJvZmlsZSBkaXJlY3RvcnlcbiAgLy8gICAgICBpdHNlbGYpLlxuICAvLyA0LiB0aGUgdXNlciBzcGVjaWZpZWRcbiAgLy8gICAgaS4gY2hyb21pdW0gQU5EXG4gIC8vICAgIGlpLiB0aGUgdXNlci1kYXRhLWRpciBleGlzdHMgQU5EXG4gIC8vICAgIGlpaS4gdGhlIFwicHJvZmlsZVwiIG5hbWUgZXhpc3RzIGFzIGEgc3ViZGlyZWN0b3J5IGluIHRoZSB1c2VyLWRhdGEtZGlyXG4gIC8vICAgICAgKGluIHdoaWNoIGNhc2Ugd2UgaGF2ZSBhIGNsZWFybHkgZGVmaW5lZCBleGlzdGluZyBwcm9maWxlIHRvIHVzZSlcbiAgLy8gQW55IGNhc2Ugb3RoZXIgdGhhbiBvbmUgb2YgdGhlIGFib3ZlIGNhc2VzIGlzIGFuIGVycm9yLlxuXG4gIC8vIFRoaXMgaXMgbm90IHRoZSBtb3N0IGNvbmNpc2Ugd2F5IHRvIGNoZWNrIHRoZXNlIGNhc2VzLCBidXQgbWVhbnRcbiAgLy8gdG8gYmUgdGhlIGVhc2llc3QgdG8gZm9sbG93LCBieSBtYXRjaGluZyB0aGUgYWJvdmUgZXhhY3QgY3JpdGVyaWFcbiAgY29uc3QgaXNVc2VyRGF0YURpckV4aXN0aW5nID0gYXdhaXQgaXNEaXJSZWFkYWJsZShhcmdzLnVzZXJEYXRhRGlyKTtcblxuICBjb25zdCBpc0Nhc2VPbmUgPSAhYXJncy51c2VyRGF0YURpcjtcbiAgY29uc3QgaXNDYXNlVHdvID0gIWlzQ2FzZU9uZSAmJiBhcmdzLnVzZXJEYXRhRGlyICYmICFpc1VzZXJEYXRhRGlyRXhpc3Rpbmc7XG4gIGNvbnN0IGlzQ2FzZVRocmVlID1cbiAgICAhaXNDYXNlT25lICYmICFpc0Nhc2VUd28gJiYgIWlzQ2hyb21pdW0gJiYgaXNVc2VyRGF0YURpckV4aXN0aW5nO1xuXG4gIGNvbnN0IGlzUHJvZmlsZVJlYWRhYmxlID0gYXdhaXQgaXNEaXJSZWFkYWJsZShhcmdzLnVzZXJEYXRhRGlyLCBhcmdzLnByb2ZpbGUpO1xuICBjb25zdCBpc0Nhc2VGb3VyID1cbiAgICAhaXNDYXNlT25lICYmXG4gICAgIWlzQ2FzZVR3byAmJlxuICAgICFpc0Nhc2VUaHJlZSAmJlxuICAgIGlzQ2hyb21pdW0gJiZcbiAgICBpc1VzZXJEYXRhRGlyRXhpc3RpbmcgJiZcbiAgICBpc1Byb2ZpbGVSZWFkYWJsZTtcblxuICBsZXQgdmFsaWRhdGVkVXNlckRhdGFEaXIsIHZhbGlkYXRlZFByb2ZpbGU7XG4gIGlmIChpc0Nhc2VPbmUpIHtcbiAgICBjb25zdCB0ZW1wRGlyUGF0aCA9IGF3YWl0IG1rZHRlbXBEaXNwb3NhYmxlKGpvaW4odG1wZGlyKCksIHByb2dyYW1OYW1lKSk7XG4gICAgdmFsaWRhdGVkVXNlckRhdGFEaXIgPSB0ZW1wRGlyUGF0aC5wYXRoO1xuICB9IGVsc2UgaWYgKGlzQ2FzZVR3byB8fCBpc0Nhc2VUaHJlZSkge1xuICAgIHZhbGlkYXRlZFVzZXJEYXRhRGlyID0gYXJncy51c2VyRGF0YURpcjtcbiAgfSBlbHNlIGlmIChpc0Nhc2VGb3VyKSB7XG4gICAgdmFsaWRhdGVkVXNlckRhdGFEaXIgPSBqb2luKGFyZ3MudXNlckRhdGFEaXIsIGFyZ3MucHJvZmlsZSk7XG4gICAgdmFsaWRhdGVkUHJvZmlsZSA9IGFyZ3MucHJvZmlsZTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIkludmFsaWQgdXNlci1kYXRhLWRpciBjb25maWcuICBFaXRoZXIgbXVzdCBzcGVjaWZ5IG5vIFwiICtcbiAgICAgICAgXCJ1c2VyLWRhdGEtZGlyLCBvciBhIHVzZXItZGF0YS1kaXIgYXJndW1lbnQgZm9yIGEgZGlyZWN0b3J5IHRoYXQgXCIgK1xuICAgICAgICBcImRvZXMgbm90IGN1cnJlbnRseSBleGlzdCwgb3Igc3BlY2lmeSBhIHZhbGlkIHVzZXItZGF0YS1kaXIgKHdpdGggXCIgK1xuICAgICAgICBcInRoZSBzcGVjaWZpZWQgcHJvZmlsZSBhcyBhIHN1YmRpcmVjdG9yeSBpbiB0aGUgdXNlci1kYXRhLWRpciBpZiBcIiArXG4gICAgICAgIFwiY2hyb21pdW0pLlwiLFxuICAgICk7XG4gIH1cblxuICAvLyBXZSBvbmx5IGFsbG93IHRoZSBgYmluYXJ5YCBhcmd1bWVudCBmb3IgQ2hyb21pdW0tZmFtaWx5IGJyb3dzZXJzLFxuICAvLyBzaW5jZSB3ZSBjYW4gZG8gb3VyIG1lYXN1cmVtZW50cyBvbiB0aGUgXCJzdG9ja1wiIHZlcnNpb25zIG9mIHRoZXNlLlxuICAvLyBGb3IgR2Vja28gYW5kIFdlYktpdCBicm93c2VycywgdGhlc2UgcmVxdWlyZSB0aGUgcGxheXdyaWdodCBwYXRjaGVzXG4gIC8vIGZvciBvdXIgbWVhc3VyZW1lbnRzIHRvIHN1Y2NlZWQsIGFuZCBzbyB3ZSBuZWNlc3NhcmlseSBoYXZlIHRvIHVzZVxuICAvLyB0aGUgcGxheXdyaWdodCBwcm92aWRlZCBvbmVzLlxuICBsZXQgYmluYXJ5UGF0aDogUGF0aCB8IHVuZGVmaW5lZDtcblxuICAvLyBJZiB3ZSB3ZXJlbid0IHBhc3NlZCBhIHBhdGggdG8gYSBicm93c2VyIGJpbmFyeSwgdXNlIHRoZSBwYXRocyB0byB0aGVcbiAgLy8gcGxheXdyaWdodCBiaW5hcmllcy5cbiAgaWYgKGFyZ3MuYmluYXJ5X3BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgIHN3aXRjaCAoYXJncy5icm93c2VyKSB7XG4gICAgICBjYXNlIEJyb3dzZXJUeXBlLkJyYXZlOlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJNdXN0IGluY2x1ZGUgYSBiaW5hcnkgcGF0aCB3aGVuIHRlc3RpbmcgQnJhdmUgKHNpbmNlIFwiICtcbiAgICAgICAgICAgIFwicGxheXdyaWdodCBkb2VzIG5vdCBoYXZlIGEgZGVmYXVsdCBCcmF2ZSBiaW5hcnkgaW5jbHVkZWRcIixcbiAgICAgICAgKTtcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuQ2hyb21pdW06XG4gICAgICAgIGJpbmFyeVBhdGggPSBjaHJvbWl1bS5leGVjdXRhYmxlUGF0aCgpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuR2Vja286XG4gICAgICAgIGJpbmFyeVBhdGggPSBmaXJlZm94LmV4ZWN1dGFibGVQYXRoKCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBCcm93c2VyVHlwZS5XZWJLaXQ6XG4gICAgICAgIGJpbmFyeVBhdGggPSB3ZWJraXQuZXhlY3V0YWJsZVBhdGgoKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGFzc2VydCh0eXBlb2YgYXJncy5iaW5hcnlfcGF0aCA9PT0gXCJzdHJpbmdcIik7XG4gICAgc3dpdGNoIChhcmdzLmJyb3dzZXIpIHtcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuQnJhdmU6XG4gICAgICBjYXNlIEJyb3dzZXJUeXBlLkNocm9taXVtOlxuICAgICAgICBpZiAoIShhd2FpdCBpc1BhdGhUb0V4ZWNGaWxlKGFyZ3MuYmluYXJ5X3BhdGgpKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBJbnZhbGlkIGJpbmFyeSBwYXRoLiBcIiR7YXJncy5iaW5hcnlfcGF0aH1cIiBpcyBub3QgYW4gYCArXG4gICAgICAgICAgICAgIFwiZXhlY3V0YWJsZSBmaWxlLlwiLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYmluYXJ5UGF0aCA9IGFyZ3MuYmluYXJ5X3BhdGg7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBCcm93c2VyVHlwZS5HZWNrbzpcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuV2ViS2l0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJJbnZhbGlkIGJpbmFyeSBwYXRoLiBVbmFibGUgdG8gdXNlIC0tYmluYXJ5IGFyZ3VtZW50IFwiICtcbiAgICAgICAgICAgIFwid2l0aCAtLWJyb3dzZXI9ZmlyZWZveCBvciBnZWNrbywgc2luY2UgdGhlc2UgdGVzdHMgb25seSB3b3JrIHdpdGggXCIgK1xuICAgICAgICAgICAgXCJ0aGUgcGxheXdyaWdodC1wYXRjaGVkIHZlcnNpb25zIG9mIHRoZXNlIGJyb3dzZXJzLiBZb3UgY2FuIGluc3RhbGwgXCIgK1xuICAgICAgICAgICAgJ3RoZW0gd2l0aCBcIm5wbSBydW4gaW5zdGFsbC1icm93c2Vyc1wiLicsXG4gICAgICAgICk7XG4gICAgfVxuICB9XG4gIGFzc2VydC5vayhiaW5hcnlQYXRoKTtcblxuICBpZiAoYXJncy5oZWlnaHQgPD0gMCB8fCBhcmdzLndpZHRoIDw9IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIlRoZSBoZWlnaHQgYW5kIHdpZHRoIG9mIHRoZSB2aWV3cG9ydCBtdXN0IGJvdGggYmUgXCIgK1xuICAgICAgICBcIiBwb3NpdGl2ZSB2YWx1ZXMuXCIsXG4gICAgKTtcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgYXJncy5oZWlnaHQgPT09IFwic3RyaW5nXCIpO1xuICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IHBhcnNlSW50KGFyZ3MuaGVpZ2h0LCAxMCk7XG4gIGFzc2VydC5ub3REZWVwU3RyaWN0RXF1YWwodmlld3BvcnRIZWlnaHQsIE5hTik7XG5cbiAgYXNzZXJ0KHR5cGVvZiBhcmdzLndpZHRoID09PSBcInN0cmluZ1wiKTtcbiAgY29uc3Qgdmlld3BvcnRXaWR0aCA9IHBhcnNlSW50KGFyZ3Mud2lkdGgsIDEwKTtcbiAgYXNzZXJ0Lm5vdERlZXBTdHJpY3RFcXVhbCh2aWV3cG9ydFdpZHRoLCBOYU4pO1xuXG4gIGlmIChhcmdzLnRpbWVvdXQgPD0gMCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSAtLXRpbWVvdXQgYXJndW1lbnQgbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlci5cIik7XG4gIH0gZWxzZSBpZiAoYXJncy50aW1lb3V0ID4gNTAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJZb3UgaGF2ZSBhIHZlcnkgaGlnaCB2YWx1ZSBmb3Igc2Vjb25kcy4gTm90ZSB0aGlzIGlzIFwiICtcbiAgICAgICAgXCJzZWNvbmRzLCBub3QgbWlsbGlzZWNvbmRzLlwiLFxuICAgICk7XG4gIH1cbiAgYXNzZXJ0KHR5cGVvZiBhcmdzLnRpbWVvdXQgPT09IFwic3RyaW5nXCIpO1xuICBjb25zdCB0aW1lb3V0U2Vjb25kcyA9IHBhcnNlSW50KGFyZ3MudGltZW91dCwgMTApO1xuICBhc3NlcnQubm90RGVlcFN0cmljdEVxdWFsKHRpbWVvdXRTZWNvbmRzLCBOYU4pO1xuXG4gIGFzc2VydChhcmdzLmJyb3dzZXIgaW4gQnJvd3NlclR5cGUpO1xuICBjb25zdCBicm93c2VyVHlwZSA9IGFyZ3MuYnJvd3NlciBhcyBCcm93c2VyVHlwZTtcblxuICBhc3NlcnQoYXJncy5sb2dnaW5nIGluIExvZ2dpbmdMZXZlbCk7XG4gIGNvbnN0IGxvZ2dpbmdMZXZlbCA9IGFyZ3MubG9nZ2luZyBhcyBMb2dnaW5nTGV2ZWw7XG5cbiAgY29uc3QgbWVhc3VyZW1lbnRUeXBlczogTWVhc3VyZW1lbnRUeXBlW10gPSBbXTtcbiAgZm9yIChjb25zdCBhTWVhc3VyZW1lbnRUeXBlIG9mIGFyZ3MubWVhc3VyZW1lbnRzKSB7XG4gICAgYXNzZXJ0KGFNZWFzdXJlbWVudFR5cGUgaW4gTWVhc3VyZW1lbnRUeXBlKTtcbiAgICBtZWFzdXJlbWVudFR5cGVzLnB1c2goYU1lYXN1cmVtZW50VHlwZSBhcyBNZWFzdXJlbWVudFR5cGUpO1xuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiBhcmdzLnNlY29uZHMgPT09IFwibnVtYmVyXCIpO1xuXG4gIHJldHVybiB7XG4gICAgYmluYXJ5OiBiaW5hcnlQYXRoLFxuICAgIGJyb3dzZXI6IGJyb3dzZXJUeXBlLFxuICAgIGxvZ2dpbmdMZXZlbDogbG9nZ2luZ0xldmVsLFxuICAgIG1lYXN1cmVtZW50czogbWVhc3VyZW1lbnRUeXBlcyxcbiAgICBwcm9maWxlOiB2YWxpZGF0ZWRQcm9maWxlLFxuICAgIHNlY29uZHM6IGFyZ3Muc2Vjb25kcyxcbiAgICB0aW1lb3V0OiB0aW1lb3V0U2Vjb25kcyxcbiAgICB1cmw6IGFyZ3MudXJsLFxuICAgIHVzZXJEYXRhRGlyOiB2YWxpZGF0ZWRVc2VyRGF0YURpcixcbiAgICB2aWV3cG9ydDoge1xuICAgICAgaGVpZ2h0OiB2aWV3cG9ydEhlaWdodCxcbiAgICAgIHdpZHRoOiB2aWV3cG9ydFdpZHRoLFxuICAgIH0sXG4gIH07XG59O1xuIl19