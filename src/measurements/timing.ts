import { BaseMeasurer, MeasurementResult } from "./base.js";
import { MeasurementType, Serializable } from "../types.js";

const injected_getPageMeasurements = (): Promise<Serializable> => {
  return new Promise((resolve) => {
    const navEntries = window.performance.getEntriesByType("navigation")[0];

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastLCPEntry = entries[entries.length - 1];
      resolve({
        navigation: navEntries.toJSON() as unknown,
        lcp: lastLCPEntry.toJSON() as unknown,
      });
    });

    observer.observe({
      type: "largest-contentful-paint",
      buffered: true,
    });
  });
};

export class TimingMeasurer extends BaseMeasurer {
  measurementType(): MeasurementType {
    return MeasurementType.Timing;
  }

  async collect(): Promise<MeasurementResult | null> {
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
