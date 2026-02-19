import assert from "node:assert/strict";
import { access, constants, mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { BrowserType } from "./types.js";
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
    const isCaseFour = !isCaseOne &&
        !isCaseTwo &&
        !isCaseThree &&
        isChromium &&
        isUserDataDirExisting &&
        (await isDirReadable(args.userDataDir, args.profile));
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
    const viewportHeight = parseInt(args.height, 10);
    assert.notDeepStrictEqual(viewportHeight, NaN);
    const viewportWidth = parseInt(args.width, 10);
    assert.notDeepStrictEqual(viewportWidth, NaN);
    if (args.timeout <= 0) {
        throw new Error("The --timeout argument must be a positive number.");
    }
    else if (args.timeout > 500) {
        throw new Error("You have a very high value for seconds. Note this is " +
            "seconds, not milliseconds.");
    }
    const timeoutSeconds = parseInt(args.timeout, 10);
    assert.notDeepStrictEqual(timeoutSeconds, NaN);
    return {
        binary: binaryPath,
        browser: args.browser,
        logLevel: args.logging,
        measurements: args.measurements,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLE1BQU0sTUFBTSxvQkFBb0IsQ0FBQztBQUN4QyxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDakMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUdqQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFdkQsT0FBTyxFQUFFLFdBQVcsRUFBbUIsTUFBTSxZQUFZLENBQUM7QUFFMUQsTUFBTSxXQUFXLEdBQUcsMEJBQTBCLENBQUM7QUFDL0MsTUFBTSxZQUFZLEdBQUcsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFFekMsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLEVBQUUsSUFBVSxFQUFvQixFQUFFO0lBQzlELElBQUksQ0FBQztRQUNILE1BQU0sTUFBTSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxhQUFhLEdBQUcsS0FBSyxFQUFFLEdBQUcsWUFBb0IsRUFBb0IsRUFBRTtJQUN4RSxJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEQsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxFQUFFLElBQWUsRUFBc0IsRUFBRTtJQUM1RSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztJQUNoQyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDOUMsTUFBTSxJQUFJLEtBQUssQ0FDYixvRUFBb0U7WUFDbEUsV0FBVyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsR0FBRyxDQUNsQyxDQUFDO0lBQ0osQ0FBQztJQUVELElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sSUFBSSxLQUFLLENBQ2IsaURBQWlEO1lBQy9DLGFBQWEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEdBQUcsQ0FDcEMsQ0FBQztJQUNKLENBQUM7SUFFRCxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRCxNQUFNLFVBQVUsR0FDZCxJQUFJLENBQUMsT0FBTyxLQUFLLFdBQVcsQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxXQUFXLENBQUMsS0FBSyxDQUFDO0lBRTlFLElBQUksSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQ2Isa0RBQWtEO1lBQ2hELDhDQUE4QyxDQUNqRCxDQUFDO0lBQ0osQ0FBQztJQUVELCtEQUErRDtJQUMvRCxzRUFBc0U7SUFDdEUsdUJBQXVCO0lBQ3ZCLDBFQUEwRTtJQUMxRSw0RUFBNEU7SUFDNUUsWUFBWTtJQUNaLHdCQUF3QjtJQUN4Qix5QkFBeUI7SUFDekIsa0NBQWtDO0lBQ2xDLHdFQUF3RTtJQUN4RSxnQkFBZ0I7SUFDaEIsd0JBQXdCO0lBQ3hCLHFCQUFxQjtJQUNyQixzQ0FBc0M7SUFDdEMsMkVBQTJFO0lBQzNFLHlFQUF5RTtJQUN6RSwwREFBMEQ7SUFFMUQsbUVBQW1FO0lBQ25FLG9FQUFvRTtJQUNwRSxNQUFNLHFCQUFxQixHQUFHLE1BQU0sYUFBYSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUVwRSxNQUFNLFNBQVMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDcEMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLHFCQUFxQixDQUFDO0lBQzNFLE1BQU0sV0FBVyxHQUNmLENBQUMsU0FBUyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsVUFBVSxJQUFJLHFCQUFxQixDQUFDO0lBQ25FLE1BQU0sVUFBVSxHQUNkLENBQUMsU0FBUztRQUNWLENBQUMsU0FBUztRQUNWLENBQUMsV0FBVztRQUNaLFVBQVU7UUFDVixxQkFBcUI7UUFDckIsQ0FBQyxNQUFNLGFBQWEsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBRXhELElBQUksb0JBQW9CLEVBQUUsZ0JBQWdCLENBQUM7SUFDM0MsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUNkLE1BQU0sV0FBVyxHQUFHLE1BQU0saUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDekUsb0JBQW9CLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQztJQUMxQyxDQUFDO1NBQU0sSUFBSSxTQUFTLElBQUksV0FBVyxFQUFFLENBQUM7UUFDcEMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUMxQyxDQUFDO1NBQU0sSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUN0QixvQkFBb0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUQsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNsQyxDQUFDO1NBQU0sQ0FBQztRQUNOLE1BQU0sSUFBSSxLQUFLLENBQ2Isd0RBQXdEO1lBQ3RELGtFQUFrRTtZQUNsRSxtRUFBbUU7WUFDbkUsa0VBQWtFO1lBQ2xFLFlBQVksQ0FDZixDQUFDO0lBQ0osQ0FBQztJQUVELG9FQUFvRTtJQUNwRSxxRUFBcUU7SUFDckUsc0VBQXNFO0lBQ3RFLHFFQUFxRTtJQUNyRSxnQ0FBZ0M7SUFDaEMsSUFBSSxVQUE0QixDQUFDO0lBRWpDLHdFQUF3RTtJQUN4RSx1QkFBdUI7SUFDdkIsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ25DLFFBQVEsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3JCLEtBQUssV0FBVyxDQUFDLEtBQUs7Z0JBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQ2IsdURBQXVEO29CQUNyRCwwREFBMEQsQ0FDN0QsQ0FBQztZQUNKLEtBQUssV0FBVyxDQUFDLFFBQVE7Z0JBQ3ZCLFVBQVUsR0FBRyxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3ZDLE1BQU07WUFDUixLQUFLLFdBQVcsQ0FBQyxLQUFLO2dCQUNwQixVQUFVLEdBQUcsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN0QyxNQUFNO1lBQ1IsS0FBSyxXQUFXLENBQUMsTUFBTTtnQkFDckIsVUFBVSxHQUFHLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDckMsTUFBTTtRQUNWLENBQUM7SUFDSCxDQUFDO1NBQU0sQ0FBQztRQUNOLE1BQU0sQ0FBQyxPQUFPLElBQUksQ0FBQyxXQUFXLEtBQUssUUFBUSxDQUFDLENBQUM7UUFDN0MsUUFBUSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDckIsS0FBSyxXQUFXLENBQUMsS0FBSyxDQUFDO1lBQ3ZCLEtBQUssV0FBVyxDQUFDLFFBQVE7Z0JBQ3ZCLElBQUksQ0FBQyxDQUFDLE1BQU0sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDaEQsTUFBTSxJQUFJLEtBQUssQ0FDYix5QkFBeUIsSUFBSSxDQUFDLFdBQVcsY0FBYzt3QkFDckQsa0JBQWtCLENBQ3JCLENBQUM7Z0JBQ0osQ0FBQztnQkFDRCxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztnQkFDOUIsTUFBTTtZQUNSLEtBQUssV0FBVyxDQUFDLEtBQUssQ0FBQztZQUN2QixLQUFLLFdBQVcsQ0FBQyxNQUFNO2dCQUNyQixNQUFNLElBQUksS0FBSyxDQUNiLHVEQUF1RDtvQkFDckQsb0VBQW9FO29CQUNwRSxxRUFBcUU7b0JBQ3JFLHVDQUF1QyxDQUMxQyxDQUFDO1FBQ04sQ0FBQztJQUNILENBQUM7SUFDRCxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRXRCLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUN4QyxNQUFNLElBQUksS0FBSyxDQUNiLG9EQUFvRDtZQUNsRCxtQkFBbUIsQ0FDdEIsQ0FBQztJQUNKLENBQUM7SUFDRCxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNqRCxNQUFNLENBQUMsa0JBQWtCLENBQUMsY0FBYyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQy9DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQy9DLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFOUMsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsbURBQW1ELENBQUMsQ0FBQztJQUN2RSxDQUFDO1NBQU0sSUFBSSxJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQzlCLE1BQU0sSUFBSSxLQUFLLENBQ2IsdURBQXVEO1lBQ3JELDRCQUE0QixDQUMvQixDQUFDO0lBQ0osQ0FBQztJQUNELE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2xELE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFL0MsT0FBTztRQUNMLE1BQU0sRUFBRSxVQUFVO1FBQ2xCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztRQUNyQixRQUFRLEVBQUUsSUFBSSxDQUFDLE9BQU87UUFDdEIsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZO1FBQy9CLE9BQU8sRUFBRSxnQkFBZ0I7UUFDekIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1FBQ3JCLE9BQU8sRUFBRSxjQUFjO1FBQ3ZCLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztRQUNiLFdBQVcsRUFBRSxvQkFBb0I7UUFDakMsUUFBUSxFQUFFO1lBQ1IsTUFBTSxFQUFFLGNBQWM7WUFDdEIsS0FBSyxFQUFFLGFBQWE7U0FDckI7S0FDRixDQUFDO0FBQ0osQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGFzc2VydCBmcm9tIFwibm9kZTphc3NlcnQvc3RyaWN0XCI7XG5pbXBvcnQgeyBhY2Nlc3MsIGNvbnN0YW50cywgbWtkdGVtcERpc3Bvc2FibGUgfSBmcm9tIFwibm9kZTpmcy9wcm9taXNlc1wiO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSBcIm5vZGU6b3NcIjtcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5cbmltcG9ydCB7IE5hbWVzcGFjZSB9IGZyb20gXCJhcmdwYXJzZVwiO1xuaW1wb3J0IHsgY2hyb21pdW0sIGZpcmVmb3gsIHdlYmtpdCB9IGZyb20gXCJwbGF5d3JpZ2h0XCI7XG5cbmltcG9ydCB7IEJyb3dzZXJUeXBlLCBQYXRoLCBSdW5Db25maWcgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBwcm9ncmFtTmFtZSA9IFwicHJpdmFjeS1wZXJmLWNvbXBhcmlzb25zXCI7XG5jb25zdCB2YWxpZFNjaGVtZXMgPSBbXCJodHRwOlwiLCBcImh0dHBzOlwiXTtcblxuY29uc3QgaXNQYXRoVG9FeGVjRmlsZSA9IGFzeW5jIChwYXRoOiBQYXRoKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIHRyeSB7XG4gICAgYXdhaXQgYWNjZXNzKHBhdGgsIGNvbnN0YW50cy5YX09LKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59O1xuXG5jb25zdCBpc0RpclJlYWRhYmxlID0gYXN5bmMgKC4uLnBhdGhTZWdtZW50czogUGF0aFtdKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIHRyeSB7XG4gICAgYXdhaXQgYWNjZXNzKGpvaW4oLi4ucGF0aFNlZ21lbnRzKSwgY29uc3RhbnRzLlJfT0spO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBydW5Db25maWdGb3JBcmdzID0gYXN5bmMgKGFyZ3M6IE5hbWVzcGFjZSk6IFByb21pc2U8UnVuQ29uZmlnPiA9PiB7XG4gIGFzc2VydChhcmdzLnVybCBpbnN0YW5jZW9mIFVSTCk7XG4gIGlmICghdmFsaWRTY2hlbWVzLmluY2x1ZGVzKGFyZ3MudXJsLnByb3RvY29sKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiSW52YWxpZCBVUkwuIE11c3QgY29udGFpbiBhIGh0dHAocykgc2NoZW1lIGFuZCBob3N0bmFtZS4gUmVjZWl2ZWQgXCIgK1xuICAgICAgICBgc2NoZW1lIFwiJHthcmdzLnVybC5wcm90b2NvbH1cImAsXG4gICAgKTtcbiAgfVxuXG4gIGlmICghYXJncy51cmwuaG9zdG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIkludmFsaWQgVVJMLiBNdXN0IGNvbnRhaW4gYSBob3N0bmFtZS4gUmVjZWl2ZWQgXCIgK1xuICAgICAgICBgaG9zdG5hbWUgXCIke2FyZ3MudXJsLmhvc3RuYW1lfVwiYCxcbiAgICApO1xuICB9XG5cbiAgaWYgKGFyZ3Muc2Vjb25kcyA8PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIFwic2Vjb25kc1wiLiBNdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlci4nKTtcbiAgfVxuXG4gIGNvbnN0IGlzQ2hyb21pdW0gPVxuICAgIGFyZ3MuYnJvd3NlciA9PT0gQnJvd3NlclR5cGUuQ2hyb21pdW0gfHwgYXJncy5icm93c2VyID09PSBCcm93c2VyVHlwZS5CcmF2ZTtcblxuICBpZiAoYXJncy5wcm9maWxlICYmICFpc0Nocm9taXVtKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJJbnZhbGlkIHByb2ZpbGUuIE9ubHkgQ2hyb21pdW0gYnJvd3NlcnMgc3VwcG9ydCBcIiArXG4gICAgICAgIFwibXVsdGlwbGUgcHJvZmlsZXMgaW4gYSBzaW5nbGUgdXNlciBkYXRhIGRpci5cIixcbiAgICApO1xuICB9XG5cbiAgLy8gSGVyZSB3ZSBjaGVjayB0aGF0IG9uZSBvZiB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIHRydWU6XG4gIC8vIDEuIHRoZSB1c2VyIGRpZG4ndCBzcGVjaWZ5IGEgdXNlci1kYXRhLWRpciAoaW4gd2hpY2ggY2FzZSB3ZSBjcmVhdGVcbiAgLy8gICAgYSB0ZW1wb3Jhcnkgb25lKS5cbiAgLy8gMi4gdGhlIHVzZXIgc3BlY2lmaWVkIGEgdXNlci1kYXRhLWRpciwgYW5kIHRoYXQgcGF0aCBpcyBlbXB0eSAoaW4gd2hpY2hcbiAgLy8gICAgY2FzZSB3ZSByZWx5IG9uIHRoZSBicm93c2VyIHRvIGNyZWF0ZSBhIG5ldyB1c2VyIGRhdGEgZGlyIGF0IHRoZSBnaXZlblxuICAvLyAgICBwYXRoKSxcbiAgLy8gMy4gdGhlIHVzZXIgc3BlY2lmaWVkXG4gIC8vICAgIGkuIE5PVCBjaHJvbWl1bSBBTkRcbiAgLy8gICAgaWkuIHRoZSB1c2VyLWRhdGEtZGlyIGV4aXN0c1xuICAvLyAgICAgIChpbiB3aGljaCBjYXNlIHdlIHVzZSB0aGUgdXNlci1kYXRhLWRpciBhcyB0aGUgcHJvZmlsZSBkaXJlY3RvcnlcbiAgLy8gICAgICBpdHNlbGYpLlxuICAvLyA0LiB0aGUgdXNlciBzcGVjaWZpZWRcbiAgLy8gICAgaS4gY2hyb21pdW0gQU5EXG4gIC8vICAgIGlpLiB0aGUgdXNlci1kYXRhLWRpciBleGlzdHMgQU5EXG4gIC8vICAgIGlpaS4gdGhlIFwicHJvZmlsZVwiIG5hbWUgZXhpc3RzIGFzIGEgc3ViZGlyZWN0b3J5IGluIHRoZSB1c2VyLWRhdGEtZGlyXG4gIC8vICAgICAgKGluIHdoaWNoIGNhc2Ugd2UgaGF2ZSBhIGNsZWFybHkgZGVmaW5lZCBleGlzdGluZyBwcm9maWxlIHRvIHVzZSlcbiAgLy8gQW55IGNhc2Ugb3RoZXIgdGhhbiBvbmUgb2YgdGhlIGFib3ZlIGNhc2VzIGlzIGFuIGVycm9yLlxuXG4gIC8vIFRoaXMgaXMgbm90IHRoZSBtb3N0IGNvbmNpc2Ugd2F5IHRvIGNoZWNrIHRoZXNlIGNhc2VzLCBidXQgbWVhbnRcbiAgLy8gdG8gYmUgdGhlIGVhc2llc3QgdG8gZm9sbG93LCBieSBtYXRjaGluZyB0aGUgYWJvdmUgZXhhY3QgY3JpdGVyaWFcbiAgY29uc3QgaXNVc2VyRGF0YURpckV4aXN0aW5nID0gYXdhaXQgaXNEaXJSZWFkYWJsZShhcmdzLnVzZXJEYXRhRGlyKTtcblxuICBjb25zdCBpc0Nhc2VPbmUgPSAhYXJncy51c2VyRGF0YURpcjtcbiAgY29uc3QgaXNDYXNlVHdvID0gIWlzQ2FzZU9uZSAmJiBhcmdzLnVzZXJEYXRhRGlyICYmICFpc1VzZXJEYXRhRGlyRXhpc3Rpbmc7XG4gIGNvbnN0IGlzQ2FzZVRocmVlID1cbiAgICAhaXNDYXNlT25lICYmICFpc0Nhc2VUd28gJiYgIWlzQ2hyb21pdW0gJiYgaXNVc2VyRGF0YURpckV4aXN0aW5nO1xuICBjb25zdCBpc0Nhc2VGb3VyID1cbiAgICAhaXNDYXNlT25lICYmXG4gICAgIWlzQ2FzZVR3byAmJlxuICAgICFpc0Nhc2VUaHJlZSAmJlxuICAgIGlzQ2hyb21pdW0gJiZcbiAgICBpc1VzZXJEYXRhRGlyRXhpc3RpbmcgJiZcbiAgICAoYXdhaXQgaXNEaXJSZWFkYWJsZShhcmdzLnVzZXJEYXRhRGlyLCBhcmdzLnByb2ZpbGUpKTtcblxuICBsZXQgdmFsaWRhdGVkVXNlckRhdGFEaXIsIHZhbGlkYXRlZFByb2ZpbGU7XG4gIGlmIChpc0Nhc2VPbmUpIHtcbiAgICBjb25zdCB0ZW1wRGlyUGF0aCA9IGF3YWl0IG1rZHRlbXBEaXNwb3NhYmxlKGpvaW4odG1wZGlyKCksIHByb2dyYW1OYW1lKSk7XG4gICAgdmFsaWRhdGVkVXNlckRhdGFEaXIgPSB0ZW1wRGlyUGF0aC5wYXRoO1xuICB9IGVsc2UgaWYgKGlzQ2FzZVR3byB8fCBpc0Nhc2VUaHJlZSkge1xuICAgIHZhbGlkYXRlZFVzZXJEYXRhRGlyID0gYXJncy51c2VyRGF0YURpcjtcbiAgfSBlbHNlIGlmIChpc0Nhc2VGb3VyKSB7XG4gICAgdmFsaWRhdGVkVXNlckRhdGFEaXIgPSBqb2luKGFyZ3MudXNlckRhdGFEaXIsIGFyZ3MucHJvZmlsZSk7XG4gICAgdmFsaWRhdGVkUHJvZmlsZSA9IGFyZ3MucHJvZmlsZTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIkludmFsaWQgdXNlci1kYXRhLWRpciBjb25maWcuICBFaXRoZXIgbXVzdCBzcGVjaWZ5IG5vIFwiICtcbiAgICAgICAgXCJ1c2VyLWRhdGEtZGlyLCBvciBhIHVzZXItZGF0YS1kaXIgYXJndW1lbnQgZm9yIGEgZGlyZWN0b3J5IHRoYXQgXCIgK1xuICAgICAgICBcImRvZXMgbm90IGN1cnJlbnRseSBleGlzdCwgb3Igc3BlY2lmeSBhIHZhbGlkIHVzZXItZGF0YS1kaXIgKHdpdGggXCIgK1xuICAgICAgICBcInRoZSBzcGVjaWZpZWQgcHJvZmlsZSBhcyBhIHN1YmRpcmVjdG9yeSBpbiB0aGUgdXNlci1kYXRhLWRpciBpZiBcIiArXG4gICAgICAgIFwiY2hyb21pdW0pLlwiLFxuICAgICk7XG4gIH1cblxuICAvLyBXZSBvbmx5IGFsbG93IHRoZSBgYmluYXJ5YCBhcmd1bWVudCBmb3IgQ2hyb21pdW0tZmFtaWx5IGJyb3dzZXJzLFxuICAvLyBzaW5jZSB3ZSBjYW4gZG8gb3VyIG1lYXN1cmVtZW50cyBvbiB0aGUgXCJzdG9ja1wiIHZlcnNpb25zIG9mIHRoZXNlLlxuICAvLyBGb3IgR2Vja28gYW5kIFdlYktpdCBicm93c2VycywgdGhlc2UgcmVxdWlyZSB0aGUgcGxheXdyaWdodCBwYXRjaGVzXG4gIC8vIGZvciBvdXIgbWVhc3VyZW1lbnRzIHRvIHN1Y2NlZWQsIGFuZCBzbyB3ZSBuZWNlc3NhcmlseSBoYXZlIHRvIHVzZVxuICAvLyB0aGUgcGxheXdyaWdodCBwcm92aWRlZCBvbmVzLlxuICBsZXQgYmluYXJ5UGF0aDogUGF0aCB8IHVuZGVmaW5lZDtcblxuICAvLyBJZiB3ZSB3ZXJlbid0IHBhc3NlZCBhIHBhdGggdG8gYSBicm93c2VyIGJpbmFyeSwgdXNlIHRoZSBwYXRocyB0byB0aGVcbiAgLy8gcGxheXdyaWdodCBiaW5hcmllcy5cbiAgaWYgKGFyZ3MuYmluYXJ5X3BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgIHN3aXRjaCAoYXJncy5icm93c2VyKSB7XG4gICAgICBjYXNlIEJyb3dzZXJUeXBlLkJyYXZlOlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJNdXN0IGluY2x1ZGUgYSBiaW5hcnkgcGF0aCB3aGVuIHRlc3RpbmcgQnJhdmUgKHNpbmNlIFwiICtcbiAgICAgICAgICAgIFwicGxheXdyaWdodCBkb2VzIG5vdCBoYXZlIGEgZGVmYXVsdCBCcmF2ZSBiaW5hcnkgaW5jbHVkZWRcIixcbiAgICAgICAgKTtcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuQ2hyb21pdW06XG4gICAgICAgIGJpbmFyeVBhdGggPSBjaHJvbWl1bS5leGVjdXRhYmxlUGF0aCgpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuR2Vja286XG4gICAgICAgIGJpbmFyeVBhdGggPSBmaXJlZm94LmV4ZWN1dGFibGVQYXRoKCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBCcm93c2VyVHlwZS5XZWJLaXQ6XG4gICAgICAgIGJpbmFyeVBhdGggPSB3ZWJraXQuZXhlY3V0YWJsZVBhdGgoKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGFzc2VydCh0eXBlb2YgYXJncy5iaW5hcnlfcGF0aCA9PT0gXCJzdHJpbmdcIik7XG4gICAgc3dpdGNoIChhcmdzLmJyb3dzZXIpIHtcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuQnJhdmU6XG4gICAgICBjYXNlIEJyb3dzZXJUeXBlLkNocm9taXVtOlxuICAgICAgICBpZiAoIShhd2FpdCBpc1BhdGhUb0V4ZWNGaWxlKGFyZ3MuYmluYXJ5X3BhdGgpKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBJbnZhbGlkIGJpbmFyeSBwYXRoLiBcIiR7YXJncy5iaW5hcnlfcGF0aH1cIiBpcyBub3QgYW4gYCArXG4gICAgICAgICAgICAgIFwiZXhlY3V0YWJsZSBmaWxlLlwiLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYmluYXJ5UGF0aCA9IGFyZ3MuYmluYXJ5X3BhdGg7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBCcm93c2VyVHlwZS5HZWNrbzpcbiAgICAgIGNhc2UgQnJvd3NlclR5cGUuV2ViS2l0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJJbnZhbGlkIGJpbmFyeSBwYXRoLiBVbmFibGUgdG8gdXNlIC0tYmluYXJ5IGFyZ3VtZW50IFwiICtcbiAgICAgICAgICAgIFwid2l0aCAtLWJyb3dzZXI9ZmlyZWZveCBvciBnZWNrbywgc2luY2UgdGhlc2UgdGVzdHMgb25seSB3b3JrIHdpdGggXCIgK1xuICAgICAgICAgICAgXCJ0aGUgcGxheXdyaWdodC1wYXRjaGVkIHZlcnNpb25zIG9mIHRoZXNlIGJyb3dzZXJzLiBZb3UgY2FuIGluc3RhbGwgXCIgK1xuICAgICAgICAgICAgJ3RoZW0gd2l0aCBcIm5wbSBydW4gaW5zdGFsbC1icm93c2Vyc1wiLicsXG4gICAgICAgICk7XG4gICAgfVxuICB9XG4gIGFzc2VydC5vayhiaW5hcnlQYXRoKTtcblxuICBpZiAoYXJncy5oZWlnaHQgPD0gMCB8fCBhcmdzLndpZHRoIDw9IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIlRoZSBoZWlnaHQgYW5kIHdpZHRoIG9mIHRoZSB2aWV3cG9ydCBtdXN0IGJvdGggYmUgXCIgK1xuICAgICAgICBcIiBwb3NpdGl2ZSB2YWx1ZXMuXCIsXG4gICAgKTtcbiAgfVxuICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IHBhcnNlSW50KGFyZ3MuaGVpZ2h0LCAxMCk7XG4gIGFzc2VydC5ub3REZWVwU3RyaWN0RXF1YWwodmlld3BvcnRIZWlnaHQsIE5hTik7XG4gIGNvbnN0IHZpZXdwb3J0V2lkdGggPSBwYXJzZUludChhcmdzLndpZHRoLCAxMCk7XG4gIGFzc2VydC5ub3REZWVwU3RyaWN0RXF1YWwodmlld3BvcnRXaWR0aCwgTmFOKTtcblxuICBpZiAoYXJncy50aW1lb3V0IDw9IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgLS10aW1lb3V0IGFyZ3VtZW50IG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXIuXCIpO1xuICB9IGVsc2UgaWYgKGFyZ3MudGltZW91dCA+IDUwMCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiWW91IGhhdmUgYSB2ZXJ5IGhpZ2ggdmFsdWUgZm9yIHNlY29uZHMuIE5vdGUgdGhpcyBpcyBcIiArXG4gICAgICAgIFwic2Vjb25kcywgbm90IG1pbGxpc2Vjb25kcy5cIixcbiAgICApO1xuICB9XG4gIGNvbnN0IHRpbWVvdXRTZWNvbmRzID0gcGFyc2VJbnQoYXJncy50aW1lb3V0LCAxMCk7XG4gIGFzc2VydC5ub3REZWVwU3RyaWN0RXF1YWwodGltZW91dFNlY29uZHMsIE5hTik7XG5cbiAgcmV0dXJuIHtcbiAgICBiaW5hcnk6IGJpbmFyeVBhdGgsXG4gICAgYnJvd3NlcjogYXJncy5icm93c2VyLFxuICAgIGxvZ0xldmVsOiBhcmdzLmxvZ2dpbmcsXG4gICAgbWVhc3VyZW1lbnRzOiBhcmdzLm1lYXN1cmVtZW50cyxcbiAgICBwcm9maWxlOiB2YWxpZGF0ZWRQcm9maWxlLFxuICAgIHNlY29uZHM6IGFyZ3Muc2Vjb25kcyxcbiAgICB0aW1lb3V0OiB0aW1lb3V0U2Vjb25kcyxcbiAgICB1cmw6IGFyZ3MudXJsLFxuICAgIHVzZXJEYXRhRGlyOiB2YWxpZGF0ZWRVc2VyRGF0YURpcixcbiAgICB2aWV3cG9ydDoge1xuICAgICAgaGVpZ2h0OiB2aWV3cG9ydEhlaWdodCxcbiAgICAgIHdpZHRoOiB2aWV3cG9ydFdpZHRoLFxuICAgIH0sXG4gIH07XG59O1xuIl19