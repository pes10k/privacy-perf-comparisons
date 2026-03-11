export type LogFunc = (...msg: unknown[]) => void;
export enum LoggingLevel {
  None = "none",
  Error = "error",
  Info = "info",
  Verbose = "verbose",
}
export interface Logger {
  willLogFor: (level: LoggingLevel) => boolean;
  prefixedLogger: (prefix: string) => Logger;
  level: LoggingLevel;
  info: LogFunc;
  verbose: LogFunc;
  error: LogFunc;
}

const nullLogFunc = () => {
  // pass
};

const baseLogFunc = (
  isError: boolean,
  prefix: string,
  ...msg: unknown[]
): void => {
  const messageParts = [prefix];
  for (const aMsgPart of msg) {
    if (aMsgPart === null || aMsgPart === undefined) {
      continue;
    } else if (Array.isArray(aMsgPart)) {
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

abstract class BaseLogger {
  abstract readonly level: LoggingLevel;
  readonly #prefix: string | undefined;

  constructor(prefix?: string) {
    if (prefix) {
      this.#prefix = prefix;
    }
  }

  #getPrefix(): string | undefined {
    return this.#prefix;
  }

  prefixedLogger(prefix: string): BaseLogger {
    return new (this.constructor as new (prefix?: string) => BaseLogger)(
      prefix,
    );
  }

  willLogFor(level: LoggingLevel): boolean {
    switch (level) {
      case LoggingLevel.None:
        return false;
      case LoggingLevel.Error:
        return this.level === LoggingLevel.Error;
      case LoggingLevel.Info:
        return (
          this.level === LoggingLevel.Error || this.level === LoggingLevel.Info
        );
      case LoggingLevel.Verbose:
        return true;
    }
  }

  info = baseLogFunc.bind(undefined, false, "INFO:", this.#getPrefix());
  verbose = baseLogFunc.bind(undefined, false, "VERBOSE:", this.#getPrefix());
  error = baseLogFunc.bind(undefined, true, "ERROR:", this.#getPrefix());
}

class NullLogger extends BaseLogger {
  level = LoggingLevel.None;
  info = nullLogFunc;
  verbose = nullLogFunc;
  error = nullLogFunc;
}

class ErrorLogger extends BaseLogger {
  level = LoggingLevel.Error;
  info = nullLogFunc;
  verbose = nullLogFunc;
}

class InfoLogger extends BaseLogger {
  level = LoggingLevel.Info;
  verbose = nullLogFunc;
}

class VerboseLogger extends BaseLogger {
  level = LoggingLevel.Verbose;
}

const logLevelToLoggerMap = {
  [LoggingLevel.Error]: new ErrorLogger(),
  [LoggingLevel.None]: new NullLogger(),
  [LoggingLevel.Info]: new InfoLogger(),
  [LoggingLevel.Verbose]: new VerboseLogger(),
};

export const getLogger = (level: LoggingLevel): Logger => {
  return logLevelToLoggerMap[level];
};
