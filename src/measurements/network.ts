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

interface Datapoint {
  size: number;
  time: Timestamp;
  type: ResourceType;
  url: URLString;
}

class PageNetworkLogger {
  readonly #owner: ContextNetworkLogger;
  readonly #requests: Datapoint[] = [];
  readonly #responses: Datapoint[] = [];
  readonly #pageURL: URLString;
  readonly #logger: Logger;
  readonly #startTime: number;

  constructor(owner: ContextNetworkLogger, logger: Logger, pageURL: URLString) {
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

  addWebSocketRequest(url: URLString, data: WSFrame): Datapoint | null {
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

  addWebSocketResponse(url: URLString, data: WSFrame): Datapoint | null {
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

  async addRequest(request: Request): Promise<Datapoint | null> {
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

  async addResponse(response: Response): Promise<Datapoint | null> {
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

class ContextNetworkLogger {
  readonly #pageLoggers: PageNetworkLogger[] = [];
  readonly #pageToLoggerMap: WeakMap<Page, PageNetworkLogger>;
  readonly #logger: Logger;
  readonly #startTime: number;

  #isClosed = false;
  #endTime?: number;

  constructor(logger: Logger) {
    this.#startTime = Date.now();
    this.#pageToLoggerMap = new WeakMap();
    this.#logger = logger;
  }

  // Used to record the request for thats driving a page navigation (i.e.,
  // the initial request to start automation, caused by something like
  // a puppeteer / playwright page.goto() call).
  async addAutomationPageNavigation(page: Page, response: Response) {
    if (this.isClosed()) {
      this.#logger.error(
        "trying to record top frame navigation, " +
          "but measurements have been closed. " +
          `page url="${page.url()}"`,
      );
      return null;
    }

    const pageMeasurements = this.#pageToLoggerMap.get(page);
    if (!pageMeasurements) {
      const errMsg =
        "Page navigation for an unknown page. " + `page url="${page.url()}"`;
      this.#logger.error(errMsg);
      return null;
    }

    const navRequest = response.request();
    await pageMeasurements.addRequest(navRequest);
    await pageMeasurements.addResponse(response);
  }

  addWSRequest(page: Page, url: URLString, data: WSFrame): Datapoint | null {
    const pageForRequest = this.#pageToLoggerMap.get(page);
    assert(pageForRequest);
    return pageForRequest.addWebSocketRequest(url, data);
  }

  addWSResponse(page: Page, url: URLString, data: WSFrame): Datapoint | null {
    const pageForResponse = this.#pageToLoggerMap.get(page);
    assert(pageForResponse);
    return pageForResponse.addWebSocketResponse(url, data);
  }

  async addRequest(page: Page, request: Request): Promise<Datapoint | null> {
    const pageForRequest = this.#pageToLoggerMap.get(page);
    assert(pageForRequest);
    return await pageForRequest.addRequest(request);
  }

  async addResponse(page: Page, response: Response): Promise<Datapoint | null> {
    const pageForResponse = this.#pageToLoggerMap.get(page);
    assert(pageForResponse);
    return await pageForResponse.addResponse(response);
  }

  // Notes that the top level frame in the page has navigated, and so
  // any future requests that happen on the page are happening on a different
  // top level document.
  notePage(page: Page): PageNetworkLogger | null {
    if (this.isClosed()) {
      this.#logger.error(
        "trying to add measurements for new top frame " +
          "but measurements have been closed. " +
          `page url="${page.url()}"`,
      );
      return null;
    }
    const pageLogger = new PageNetworkLogger(this, this.#logger, page.url());
    this.#pageLoggers.push(pageLogger);
    this.#pageToLoggerMap.set(page, pageLogger);
    return pageLogger;
  }

  isClosed(): boolean {
    return this.#isClosed;
  }

  toJSON(): Serializable {
    const pageReports: Serializable[] = [];
    for (const aLogger of this.#pageLoggers) {
      pageReports.push(aLogger.toJSON());
    }

    return {
      meta: {
        startTime: this.#startTime,
        endTime: this.#endTime,
      },
      pages: pageReports,
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

export class NetworkMeasurer extends BaseMeasurer {
  readonly #netLogger: ContextNetworkLogger;

  constructor(logger: Logger, url: URL, context: BrowserContext) {
    super(logger, url, context);
    this.#netLogger = new ContextNetworkLogger(logger);
  }

  measurementType(): MeasurementType {
    return MeasurementType.Network;
  }

  #instrumentPage(page: Page) {
    this.#netLogger.notePage(page);
    page.on("websocket", (webSocket: WebSocket) => {
      const wsUrl = webSocket.url();
      webSocket.on("framesent", (data: { payload: WSFrame }) => {
        this.#netLogger.addWSRequest(page, wsUrl, data.payload);
      });

      webSocket.on("framereceived", (data: { payload: WSFrame }) => {
        this.#netLogger.addWSResponse(page, wsUrl, data.payload);
      });
    });

    page.on("request", async (request: Request) => {
      return await this.#netLogger.addRequest(page, request);
    });

    page.on("response", async (response: Response) => {
      return await this.#netLogger.addResponse(page, response);
    });

    page.on("framenavigated", (frame: Frame) => {
      // If any frame other than the top level frame is navigating,
      // we don't care about it (since requests and other behaviors
      // from the child frames will be captured by the corresponding
      // top level frame).
      if (page.mainFrame() !== frame) {
        return;
      }
    });
  }

  instrumentContext() {
    super.instrumentContext();
    this.context.on("page", (page: Page) => {
      this.#instrumentPage(page);
    });
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
