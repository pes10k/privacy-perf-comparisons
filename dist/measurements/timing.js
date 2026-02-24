import { BaseMeasurer } from "./base.js";
import { MeasurementType } from "../types.js";
const injected_getPageMeasurements = () => {
    return new Promise((resolve) => {
        const navEntries = window.performance.getEntriesByType("navigation")[0];
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastLCPEntry = entries[entries.length - 1];
            resolve({
                navigation: navEntries.toJSON(),
                lcp: lastLCPEntry.toJSON(),
            });
        });
        observer.observe({
            type: "largest-contentful-paint",
            buffered: true,
        });
    });
};
export class TimingMeasurer extends BaseMeasurer {
    measurementType() {
        return MeasurementType.Timing;
    }
    async collect() {
        if (this.isContextClosed) {
            this.logInfo("Tried to collect results from a closed browser context");
            return null;
        }
        const timingMeasurements = [];
        for (const aPage of this.context.pages()) {
            const pageURL = aPage.url();
            if (!pageURL.startsWith("http")) {
                this.logVerbose("Not fetching timing for non-public URL: ", pageURL);
                continue;
            }
            this.logInfo("fetching timing information for page url=", pageURL);
            const pageResponse = await aPage.evaluate(injected_getPageMeasurements);
            const timingData = {
                url: pageURL,
                data: pageResponse,
            };
            timingMeasurements.push(timingData);
        }
        return {
            type: this.measurementType(),
            data: timingMeasurements,
        };
    }
}
//# sourceMappingURL=timing.js.map