import { Page, Request, Response } from '@playwright/test'

import { Logger } from './logging.js'
import { WSFrame } from './types.js'

type ResourceType = string
type Timestamp = number
type URLString = string

interface NetDatapoint {
  size: number
  time: Timestamp
  type: ResourceType
  url: URLString
}

interface NavigationDatapoints {
  request: NetDatapoint
  response: NetDatapoint
}

export class FrameMeasurements {
  readonly #requests: NetDatapoint[] = []
  readonly #responses: NetDatapoint[] = []
  readonly #frameURL: URLString
  readonly #logger: Logger
  readonly #startTime: number

  constructor (logger: Logger, frameURL: URLString) {
    this.#frameURL = frameURL
    this.#logger = logger
    this.#startTime = Date.now()
  }

  addWebSocketRequest (url: URLString, data: WSFrame): NetDatapoint {
    const datapoint = {
      size: data.length,
      time: Date.now(),
      type: 'websocket',
      url: url,
    }
    this.#requests.push(datapoint)
    this.#logger.verbose('Network (Sent) : ', datapoint)
    return datapoint
  }

  addWebSocketResponse (url: URLString, data: WSFrame): NetDatapoint {
    const datapoint = {
      size: data.length,
      time: Date.now(),
      type: 'websocket',
      url: url,
    }
    this.#responses.push(datapoint)
    this.#logger.verbose('Network (Received) : ', datapoint)
    return datapoint
  }

  async addRequest (request: Request): Promise<NetDatapoint> {
    const sizes = await request.sizes()
    const datapoint = {
      size: sizes.requestHeadersSize + sizes.requestBodySize,
      time: request.timing().startTime,
      type: request.resourceType(),
      url: request.url(),
    }
    this.#requests.push(datapoint)
    this.#logger.verbose('Network (Sent) : ', datapoint)
    return datapoint
  }

  async addResponse (response: Response): Promise<NetDatapoint> {
    let request = response.request()
    const sizes = await request.sizes()
    const datapoint = {
      size: sizes.responseHeadersSize + sizes.responseBodySize,
      time: request.timing().responseEnd,
      type: request.resourceType(),
      url: response.url(),
    }
    this.#responses.push(datapoint)
    this.#logger.verbose('Network (Received) : ', datapoint)

    // And now see if this response was a result of a redirection chain,
    // in which case we need to add all the intermediate requests too
    // (since we'll have already recorded the initial request).
    while (request.redirectedFrom()) {
      this.addRequest(request)
      request = request.redirectedFrom() as Request
    }
    return datapoint
  }
}

export class Measurements {
  readonly #frameMeasurements: FrameMeasurements[] = []
  readonly #pageToFrameMapping: WeakMap<Page, FrameMeasurements>
  readonly #logger: Logger
  readonly #startTime: number

  constructor (logger: Logger) {
    this.#startTime = Date.now()
    this.#pageToFrameMapping = new WeakMap()
    this.#logger = logger
  }

  async addPageNavigation (page: Page, response: Response): Promise<NavigationDatapoints | null> {
    const pageMeasurements = this.#pageToFrameMapping.get(page)
    if (!pageMeasurements) {
      const errMsg = 'Page navigation for an unknown page. '
        + `page url="${page.url()}"`
      this.#logger.error(errMsg)
      return null
    }

    const navRequest = response.request()
    return {
      request: await pageMeasurements.addRequest(navRequest),
      response: await pageMeasurements.addResponse(response),
    }
  }

  measurementsForNewTopFrame (page: Page): FrameMeasurements {
    const newMeasurements = new FrameMeasurements(this.#logger, page.url())
    this.#frameMeasurements.push(newMeasurements)
    this.#pageToFrameMapping.set(page, newMeasurements)
    return newMeasurements
  }
}
