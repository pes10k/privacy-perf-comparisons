import assert from "node:assert/strict";

import {
  BrowserContext,
  Frame,
  Page,
  Request,
  Response,
  WebSocket,
} from "@playwright/test";

import { BaseMeasurer, MeasurementResult } from "./base.js";
import { Logger } from "../logging.js";
import { MeasurementType, Serializable, WSFrame } from "../types.js";

type ResourceType = string;
type Timestamp = number;
type URLString = string;

interface NetDatapoint {
  size: number;
  time: Timestamp;
  type: ResourceType;
  url: URLString;
}

interface NavigationDatapoints {
  request: NetDatapoint;
  response: NetDatapoint;
}

class PageNetworkLogger {
  readonly #owner: NetworkLogger;
  readonly #requests: NetDatapoint[] = [];
  readonly #responses: NetDatapoint[] = [];
  readonly #pageURL: URLString;
  readonly #logger: Logger;
  readonly #startTime: number;

  constructor(owner: NetworkLogger, logger: Logger, pageURL: URLString) {
    this.#owner = owner;
    this.#pageURL = pageURL;
    this.#logger = logger;
    this.#startTime = Date.now();
  }

  toJSON(): Serializable {
    return {
      meta: {
        startTime: this.#startTime,
        url: this.#pageURL,
      },
      requests: this.#requests,
      responses: this.#responses,
    };
  }

  isClosed(): boolean {
    return this.#owner.isClosed();
  }

  logErrorIfClosed(msg: string, url: URLString): boolean {
    if (this.isClosed()) {
      this.#logger.error(
        `tried to record "${msg}" but measurements are ` +
          `closed. url=$"${url}"`,
      );
      return true;
    }
    return false;
  }

  addWebSocketRequest(url: URLString, data: WSFrame): NetDatapoint | null {
    if (this.logErrorIfClosed("ws request", url)) {
      return null;
    }

    const datapoint = {
      size: data.length,
      time: Date.now(),
      type: "websocket",
      url: url,
    };
    this.#requests.push(datapoint);
    this.#logger.verbose("Network (Sent) : ", datapoint);
    return datapoint;
  }

  addWebSocketResponse(url: URLString, data: WSFrame): NetDatapoint | null {
    if (this.logErrorIfClosed("ws response", url)) {
      return null;
    }

    const datapoint = {
      size: data.length,
      time: Date.now(),
      type: "websocket",
      url: url,
    };
    this.#responses.push(datapoint);
    this.#logger.verbose("Network (Received) : ", datapoint);
    return datapoint;
  }

  async addRequest(request: Request): Promise<NetDatapoint | null> {
    if (this.logErrorIfClosed("request", request.url())) {
      return null;
    }

    const sizes = await request.sizes();
    const datapoint = {
      size: sizes.requestHeadersSize + sizes.requestBodySize,
      time: request.timing().requestStart,
      type: request.resourceType(),
      url: request.url(),
    };
    this.#requests.push(datapoint);
    this.#logger.verbose("Network (Sent) : ", datapoint);
    return datapoint;
  }

  async addResponse(response: Response): Promise<NetDatapoint | null> {
    if (this.logErrorIfClosed("response", response.url())) {
      return null;
    }

    let request = response.request();
    const sizes = await request.sizes();
    const datapoint = {
      size: sizes.responseHeadersSize + sizes.responseBodySize,
      time: request.timing().responseEnd,
      type: request.resourceType(),
      url: response.url(),
    };
    this.#responses.push(datapoint);
    this.#logger.verbose("Network (Received) : ", datapoint);

    // And now see if this response was a result of a redirection chain,
    // in which case we need to add all the intermediate requests too
    // (since we'll have already recorded the initial request).
    while (request.redirectedFrom()) {
      await this.addRequest(request);
      const nextRequest = request.redirectedFrom();
      assert(nextRequest);
      request = nextRequest;
    }
    return datapoint;
  }
}

class NetworkLogger {
  readonly #pageMeasurements: PageNetworkLogger[] = [];
  readonly #pageToFrameMapping: WeakMap<Page, PageNetworkLogger>;
  readonly #logger: Logger;
  readonly #startTime: number;

  #isClosed = false;
  #endTime?: number;

  constructor(logger: Logger) {
    this.#startTime = Date.now();
    this.#pageToFrameMapping = new WeakMap();
    this.#logger = logger;
  }

  async addPageNavigation(
    page: Page,
    response: Response,
  ): Promise<NavigationDatapoints | null> {
    if (this.isClosed()) {
      this.#logger.error(
        "trying to record top frame navigation, " +
          "but measurements have been closed. " +
          `page url="${page.url()}"`,
      );
      return null;
    }

    const pageMeasurements = this.#pageToFrameMapping.get(page);
    if (!pageMeasurements) {
      const errMsg =
        "Page navigation for an unknown page. " + `page url="${page.url()}"`;
      this.#logger.error(errMsg);
      return null;
    }

    const navRequest = response.request();
    const requestDatapoint = await pageMeasurements.addRequest(navRequest);
    assert(requestDatapoint);
    const responseDatapoint = await pageMeasurements.addResponse(response);
    assert(responseDatapoint);

    return {
      request: requestDatapoint,
      response: responseDatapoint,
    };
  }

  measurementsForNewTopFrame(page: Page): PageNetworkLogger | null {
    if (this.isClosed()) {
      this.#logger.error(
        "trying to add measurements for new top frame " +
          "but measurements have been closed. " +
          `page url="${page.url()}"`,
      );
      return null;
    }
    const newMeasurements = new PageNetworkLogger(
      this,
      this.#logger,
      page.url(),
    );
    this.#pageMeasurements.push(newMeasurements);
    this.#pageToFrameMapping.set(page, newMeasurements);
    return newMeasurements;
  }

  isClosed(): boolean {
    return this.#isClosed;
  }

  toJSON(): Serializable {
    return {
      meta: {
        startTime: this.#startTime,
        endTime: this.#endTime,
      },
      pages: this.#pageMeasurements.map((x) => x.toJSON()),
    };
  }

  close(): boolean {
    if (this.isClosed()) {
      this.#logger.error("trying to close already closed network measurements");
      return false;
    }
    this.#endTime = Date.now();
    this.#isClosed = true;
    this.#logger.verbose("closing network measurements");
    return true;
  }
}

const instrumentNewPageContent = (
  measurements: PageNetworkLogger,
  page: Page,
) => {
  page.on("websocket", (webSocket: WebSocket) => {
    const wsUrl = webSocket.url();
    webSocket.on("framesent", (data: { payload: WSFrame }) => {
      measurements.addWebSocketRequest(wsUrl, data.payload);
    });

    webSocket.on("framereceived", (data: { payload: WSFrame }) => {
      measurements.addWebSocketRequest(wsUrl, data.payload);
    });
  });

  page.on("request", async (request: Request) => {
    await measurements.addRequest(request);
  });

  page.on("response", async (response: Response) => {
    await measurements.addResponse(response);
  });
};

export class NetworkMeasurer extends BaseMeasurer {
  readonly #netLogger: NetworkLogger;

  constructor(logger: Logger, url: URL, context: BrowserContext) {
    super(logger, url, context);
    this.#netLogger = new NetworkLogger(logger);
  }

  measurementType(): MeasurementType {
    return MeasurementType.Network;
  }

  instrument() {
    super.instrument();
    this.context.on("page", (page: Page) => {
      page.on("framenavigated", (frame: Frame) => {
        // If any frame other than the top level frame is navigating,
        // we don't care about it (since requests and other behaviors
        // from the child frames will be captured by the corresponding
        // top level frame).
        if (page.mainFrame() !== frame) {
          return;
        }

        // Also, only bother instrumenting public Web URLs. We don't want
        // to bother with cases where the top frame is about:blank or file://
        // or a data URL, etc.
        const pageURL = new URL(frame.url(), page.url());
        if (!pageURL.protocol.startsWith("http")) {
          return;
        }

        const pageMeasurements =
          this.#netLogger.measurementsForNewTopFrame(page);
        if (pageMeasurements) {
          instrumentNewPageContent(pageMeasurements, page);
        }
      });
    });
  }

  async addInitNavigationResponse(page: Page, response: Response) {
    await this.#netLogger.addPageNavigation(page, response);
  }

  // Disabling the linter here because this method is async, so that
  // other classes implementations can await/async if needed.
  //
  // eslint-disable-next-line @typescript-eslint/require-await
  async collect(): Promise<MeasurementResult | null> {
    this.closeIfOpen();
    return {
      type: this.measurementType(),
      data: this.#netLogger.toJSON(),
    };
  }
}
