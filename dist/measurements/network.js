import assert from 'node:assert/strict';
export class FrameMeasurements {
    #owner;
    #requests = [];
    #responses = [];
    #frameURL;
    #logger;
    #startTime;
    constructor(owner, logger, frameURL) {
        this.#owner = owner;
        this.#frameURL = frameURL;
        this.#logger = logger;
        this.#startTime = Date.now();
    }
    toJSON() {
        return {
            meta: {
                startTime: this.#startTime,
                url: this.#frameURL,
            },
            requests: this.#requests,
            responses: this.#responses,
        };
    }
    isClosed() {
        return this.#owner.isClosed();
    }
    logErrorIfClosed(msg, url) {
        if (this.isClosed()) {
            this.#logger.error(`tried to record "${msg}" but measurements are `
                + `closed. url=$"${url}"`);
            return true;
        }
        return false;
    }
    addWebSocketRequest(url, data) {
        if (this.logErrorIfClosed('ws request', url)) {
            return null;
        }
        const datapoint = {
            size: data.length,
            time: Date.now(),
            type: 'websocket',
            url: url,
        };
        this.#requests.push(datapoint);
        this.#logger.verbose('Network (Sent) : ', datapoint);
        return datapoint;
    }
    addWebSocketResponse(url, data) {
        if (this.logErrorIfClosed('ws response', url)) {
            return null;
        }
        const datapoint = {
            size: data.length,
            time: Date.now(),
            type: 'websocket',
            url: url,
        };
        this.#responses.push(datapoint);
        this.#logger.verbose('Network (Received) : ', datapoint);
        return datapoint;
    }
    async addRequest(request) {
        if (this.logErrorIfClosed('request', request.url())) {
            return null;
        }
        const sizes = await request.sizes();
        const datapoint = {
            size: sizes.requestHeadersSize + sizes.requestBodySize,
            time: request.timing().startTime,
            type: request.resourceType(),
            url: request.url(),
        };
        this.#requests.push(datapoint);
        this.#logger.verbose('Network (Sent) : ', datapoint);
        return datapoint;
    }
    async addResponse(response) {
        if (this.logErrorIfClosed('response', response.url())) {
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
        this.#logger.verbose('Network (Received) : ', datapoint);
        // And now see if this response was a result of a redirection chain,
        // in which case we need to add all the intermediate requests too
        // (since we'll have already recorded the initial request).
        while (request.redirectedFrom()) {
            this.addRequest(request);
            request = request.redirectedFrom();
        }
        return datapoint;
    }
}
export class PageMeasurements {
    #frameMeasurements = [];
    #pageToFrameMapping;
    #logger;
    #startTime;
    #isClosed = false;
    #endTime;
    #description;
    constructor(logger) {
        this.#startTime = Date.now();
        this.#pageToFrameMapping = new WeakMap();
        this.#logger = logger;
    }
    setDescription(desc) {
        this.#description = desc;
    }
    async addPageNavigation(page, response) {
        if (this.isClosed()) {
            this.#logger.error('trying to record top frame navigation, '
                + 'but measurements have been closed. '
                + `page url="${page.url()}"`);
            return null;
        }
        const pageMeasurements = this.#pageToFrameMapping.get(page);
        if (!pageMeasurements) {
            const errMsg = 'Page navigation for an unknown page. '
                + `page url="${page.url()}"`;
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
    measurementsForNewTopFrame(page) {
        if (this.isClosed()) {
            this.#logger.error('trying to add measurements for new top frame '
                + 'but measurements have been closed. '
                + `page url="${page.url()}"`);
            return null;
        }
        const newMeasurements = new FrameMeasurements(this, this.#logger, page.url());
        this.#frameMeasurements.push(newMeasurements);
        this.#pageToFrameMapping.set(page, newMeasurements);
        return newMeasurements;
    }
    isClosed() {
        return this.#isClosed;
    }
    toJSON() {
        return {
            meta: {
                startTime: this.#startTime,
                endTime: this.#endTime,
                desc: this.#description,
            },
            pages: this.#frameMeasurements.map(x => x.toJSON()),
        };
    }
    close() {
        if (this.isClosed()) {
            this.#logger.error('trying to close already closed network measurements');
            return false;
        }
        this.#endTime = Date.now();
        this.#isClosed = true;
        this.#logger.verbose('closing network measurements');
        return true;
    }
}
