const injected_botDetectEvasion = () => {
    if (window.navigator.webdriver) {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    }
};
export const applyBotDetectEvasion = async (logger, context) => {
    await context.addInitScript(injected_botDetectEvasion);
};
//# sourceMappingURL=bot-detection.js.map