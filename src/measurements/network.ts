import assert from 'node:assert/strict'

import { Page, Request, Response } from '@playwright/test'

import { Logger } from '../logging.js'
import { Serializable, WSFrame } from '../types.js'

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
  readonly #owner: PageMeasurements
  readonly #requests: NetDatapoint[] = []
  readonly #responses: NetDatapoint[] = []
  readonly #frameURL: URLString
  readonly #logger: Logger
  readonly #startTime: number

  constructor (owner: PageMeasurements, logger: Logger, frameURL: URLString) {
    this.#owner = owner
    this.#frameURL = frameURL
    this.#logger = logger
    this.#startTime = Date.now()
  }

  toJSON (): Serializable {
    return {
      meta: {
        startTime: this.#startTime,
        url: this.#frameURL,
      },
      requests: this.#requests,
      responses: this.#responses,
    }
  }

  isClosed (): boolean {
    return this.#owner.isClosed()
  }

  logErrorIfClosed (msg: string, url: URLString): boolean {
    if (this.isClosed()) {
      this.#logger.error(`tried to record "${msg}" but measurements are `
        + `closed. url=$"${url}"`)
      return true
    }
    return false
  }

  addWebSocketRequest (url: URLString, data: WSFrame): NetDatapoint | null {
    if (this.logErrorIfClosed('ws request', url)) {
      return null
    }

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

  addWebSocketResponse (url: URLString, data: WSFrame): NetDatapoint | null {
    if (this.logErrorIfClosed('ws response', url)) {
      return null
    }

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

  async addRequest (request: Request): Promise<NetDatapoint | null> {
    if (this.logErrorIfClosed('request', request.url())) {
      return null
    }

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

  async addResponse (response: Response): Promise<NetDatapoint | null> {
    if (this.logErrorIfClosed('response', response.url())) {
      return null
    }

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

export class PageMeasurements {
  readonly #frameMeasurements: FrameMeasurements[] = []
  readonly #pageToFrameMapping: WeakMap<Page, FrameMeasurements>
  readonly #logger: Logger
  readonly #startTime: number

  #isClosed = false
  #endTime?: number
  #description?: string

  constructor (logger: Logger) {
    this.#startTime = Date.now()
    this.#pageToFrameMapping = new WeakMap()
    this.#logger = logger
  }

  setDescription (desc: string) {
    this.#description = desc
  }

  async addPageNavigation (page: Page, response: Response): Promise<NavigationDatapoints | null> {
    if (this.isClosed()) {
      this.#logger.error('trying to record top frame navigation, '
        + 'but measurements have been closed. '
        + `page url="${page.url()}"`)
      return null
    }

    const pageMeasurements = this.#pageToFrameMapping.get(page)
    if (!pageMeasurements) {
      const errMsg = 'Page navigation for an unknown page. '
        + `page url="${page.url()}"`
      this.#logger.error(errMsg)
      return null
    }

    const navRequest = response.request()
    const requestDatapoint = await pageMeasurements.addRequest(navRequest)
    assert(requestDatapoint)
    const responseDatapoint = await pageMeasurements.addResponse(response)
    assert(responseDatapoint)

    return {
      request: requestDatapoint,
      response: responseDatapoint,
    }
  }

  measurementsForNewTopFrame (page: Page): FrameMeasurements | null {
    if (this.isClosed()) {
      this.#logger.error('trying to add measurements for new top frame '
        + 'but measurements have been closed. '
        + `page url="${page.url()}"`)
      return null
    }
    const newMeasurements = new FrameMeasurements(this, this.#logger, page.url())
    this.#frameMeasurements.push(newMeasurements)
    this.#pageToFrameMapping.set(page, newMeasurements)
    return newMeasurements
  }

  isClosed (): boolean {
    return this.#isClosed
  }

  toJSON (): Serializable {
    return {
      meta: {
        startTime: this.#startTime,
        endTime: this.#endTime,
        desc: this.#description,
      },
      pages: this.#frameMeasurements.map(x => x.toJSON()),
    }
  }

  close (): boolean {
    if (this.isClosed()) {
      this.#logger.error('trying to close already closed network measurements')
      return false
    }
    this.#endTime = Date.now()
    this.#isClosed = true
    this.#logger.verbose('closing network measurements')
    return true
  }
}
