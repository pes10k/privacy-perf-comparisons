export enum LoggingLevel {
  None = "none",
  Info = "info",
  Verbose = "verbose",
}

export type LogFunc = (...msg: unknown[]) => void;

export interface Logger {
  info: LogFunc;
  verbose: LogFunc;
  error: LogFunc;
}

const nullLogFunc = () => {
  // pass
};

const baseLogFunction = (
  prefix: string,
  isError: boolean,
  ...msg: unknown[]
): void => {
  const messageParts = [prefix];
  for (const aMsgPart of msg) {
    if (Array.isArray(aMsgPart)) {
      for (const aMsg of aMsgPart) {
        messageParts.push(String(aMsg));
      }
    } else if (typeof aMsgPart === "string") {
      messageParts.push(aMsgPart);
    } else if (typeof aMsgPart === "number") {
      messageParts.push(String(aMsgPart));
    } else if (typeof aMsgPart === "object") {
      messageParts.push(JSON.stringify(aMsgPart));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      messageParts.push(String(aMsgPart));
    }
  }

  const finalMessage = messageParts.join("");

  if (isError) {
    console.error(finalMessage);
  } else {
    console.log(finalMessage);
  }
};

const verboseFunc = baseLogFunction.bind(undefined, "VERBOSE:", false);
const infoFunc = baseLogFunction.bind(undefined, "INFO:", false);
const errorFunc = baseLogFunction.bind(undefined, "ERROR:", true);

const nullLogger = Object.freeze({
  info: nullLogFunc,
  verbose: nullLogFunc,
  error: errorFunc,
});

const infoLogger = Object.freeze({
  info: infoFunc,
  verbose: nullLogFunc,
  error: errorFunc,
});

const verboseLogger = Object.freeze({
  info: infoFunc,
  verbose: verboseFunc,
  error: errorFunc,
});

const logLevelToLoggerMap = {
  none: nullLogger,
  info: infoLogger,
  verbose: verboseLogger,
};

export const getLogger = (level: LoggingLevel): Logger => {
  return logLevelToLoggerMap[level];
};
