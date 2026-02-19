import assert from 'node:assert/strict'

import { BrowserContext } from 'playwright'
import { Frame, Page, Request, Response, WebSocket } from 'playwright'

import { Logger } from './logging.js'
import { PageMeasurements, FrameMeasurements } from './measurements/network.js'
import { injected_GetPageMeasurements } from './measurements/timing.js'
import { Serializable } from './types.js'

interface Measurements {
  timing: Serializable,
  network: Serializable,
}

const instrumentNewPageContent = (measurements: FrameMeasurements,
                                  logger: Logger,
                                  page: Page) => {
  page.on('websocket', (webSocket: WebSocket) => {
    const wsUrl = webSocket.url()
    webSocket.on('framesent', (data) => {
      const datapoint = measurements.addWebSocketRequest(wsUrl, data.payload)
      logger.verbose('Network (Sent) : ', datapoint)
    })

    webSocket.on('framereceived', (data) => {
      const datapoint = measurements.addWebSocketRequest(wsUrl, data.payload)
      logger.verbose('Network (Received) : ', datapoint)
    })
  })

  page.on('request', (request: Request) => {
    const datapoint = measurements.addRequest(request)
    logger.verbose('Network (Sent) : ', datapoint)
  })

  page.on('response', (response: Response) => {
    const datapoint = measurements.addResponse(response)
    logger.verbose('Network (Received) : ', datapoint)
  })
}

const instrumentContext = (logger: Logger,
                           context: BrowserContext): PageMeasurements => {
  const measurements = new PageMeasurements(logger)
  context.on('page', (page: Page) => {
    page.on('framenavigated', (frame: Frame) => {
      // If any frame other than the top level frame is navigating,
      // we don't care about it (since requests and other behaviors
      // from the child frames will be captured by the corresponding
      // top level frame).
      if (page.mainFrame() !== frame) {
        return
      }
      const pageMeasurements = measurements.measurementsForNewTopFrame(page)
      if (pageMeasurements) {
        instrumentNewPageContent(pageMeasurements, logger, page)
      }
    })
  })

  return measurements
}

export const measureURL = async (logger: Logger,
                                 context: BrowserContext,
                                 url: URL,
                                 seconds: number,
                                 timeout: number): Promise<Measurements> => {
  const netMeasurements = instrumentContext(logger, context)
  netMeasurements.setDescription(url.toString())
  const page = await context.newPage()

  logger.info(`Navigating to url="${page.url()}"`)
  const navRequest = await page.goto(url.toString(), {
    timeout: timeout * 1000,
    waitUntil: 'commit',
  })
  assert(navRequest)

  logger.info(`Arrived at url="${page.url()}"`)
  netMeasurements.addPageNavigation(page, navRequest)

  logger.info(`Letting page load for "${seconds}" seconds`)
  page.waitForTimeout(seconds * 1000)
  netMeasurements.close()

  logger.info('Fetching timing measurements')
  const timingMeasurements = await page.evaluate(injected_GetPageMeasurements)

  return {
    network: netMeasurements.toJSON(),
    timing: timingMeasurements,
  }
}
