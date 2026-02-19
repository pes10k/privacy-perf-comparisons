import assert from 'node:assert/strict';
import { PageMeasurements } from './measurements/network.js';
import { injected_GetPageMeasurements } from './measurements/timing.js';
const instrumentNewPageContent = (measurements, logger, page) => {
    page.on('websocket', (webSocket) => {
        const wsUrl = webSocket.url();
        webSocket.on('framesent', (data) => {
            const datapoint = measurements.addWebSocketRequest(wsUrl, data.payload);
            logger.verbose('Network (Sent) : ', datapoint);
        });
        webSocket.on('framereceived', (data) => {
            const datapoint = measurements.addWebSocketRequest(wsUrl, data.payload);
            logger.verbose('Network (Received) : ', datapoint);
        });
    });
    page.on('request', (request) => {
        const datapoint = measurements.addRequest(request);
        logger.verbose('Network (Sent) : ', datapoint);
    });
    page.on('response', (response) => {
        const datapoint = measurements.addResponse(response);
        logger.verbose('Network (Received) : ', datapoint);
    });
};
const instrumentContext = (logger, context) => {
    const measurements = new PageMeasurements(logger);
    context.on('page', (page) => {
        page.on('framenavigated', (frame) => {
            // If any frame other than the top level frame is navigating,
            // we don't care about it (since requests and other behaviors
            // from the child frames will be captured by the corresponding
            // top level frame).
            if (page.mainFrame() !== frame) {
                return;
            }
            const pageMeasurements = measurements.measurementsForNewTopFrame(page);
            if (pageMeasurements) {
                instrumentNewPageContent(pageMeasurements, logger, page);
            }
        });
    });
    return measurements;
};
export const measureURL = async (logger, context, url, seconds, timeout) => {
    const netMeasurements = instrumentContext(logger, context);
    netMeasurements.setDescription(url.toString());
    const page = await context.newPage();
    logger.info(`Navigating to url="${page.url()}"`);
    const navRequest = await page.goto(url.toString(), {
        timeout: timeout * 1000,
        waitUntil: 'commit',
    });
    assert(navRequest);
    logger.info(`Arrived at url="${page.url()}"`);
    netMeasurements.addPageNavigation(page, navRequest);
    logger.info(`Letting page load for "${seconds}" seconds`);
    page.waitForTimeout(seconds * 1000);
    netMeasurements.close();
    logger.info('Fetching timing measurements');
    const timingMeasurements = await page.evaluate(injected_GetPageMeasurements);
    return {
        network: netMeasurements.toJSON(),
        timing: timingMeasurements,
    };
};
