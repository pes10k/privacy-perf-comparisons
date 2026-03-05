export enum LoggingLevel {
  None = "none",
  Error = "error",
  Info = "info",
  Verbose = "verbose",
}

export type LogFunc = (...msg: unknown[]) => void;

export interface Logger {
  willLogFor: (level: LoggingLevel) => boolean;
  level: LoggingLevel;
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
  willLogFor: () => false,
  level: LoggingLevel.None,
  info: nullLogFunc,
  verbose: nullLogFunc,
  error: errorFunc,
});

const errorLogger = Object.freeze({
  willLogFor: (level: LoggingLevel) => level !== LoggingLevel.None,
  level: LoggingLevel.None,
  info: nullLogFunc,
  verbose: nullLogFunc,
  error: errorFunc,
});

const infoLogger = Object.freeze({
  willLogFor: (level: LoggingLevel) => {
    return level === LoggingLevel.Info || level === LoggingLevel.Verbose;
  },
  level: LoggingLevel.Info,
  info: infoFunc,
  verbose: nullLogFunc,
  error: errorFunc,
});

const verboseLogger = Object.freeze({
  willLogFor: () => true,
  level: LoggingLevel.Verbose,
  info: infoFunc,
  verbose: verboseFunc,
  error: errorFunc,
});

const logLevelToLoggerMap = {
  [LoggingLevel.Error]: errorLogger,
  [LoggingLevel.None]: nullLogger,
  [LoggingLevel.Info]: infoLogger,
  [LoggingLevel.Verbose]: verboseLogger,
};

export const getLogger = (level: LoggingLevel): Logger => {
  return logLevelToLoggerMap[level];
};
