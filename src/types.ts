export enum LoggingLevel {
  None = 'none',
  Info = 'info',
  Verbose = 'verbose',
}

export enum BrowserType {
  Brave = 'brave',
  Chromium = 'chromium',
  Gecko = 'gecko',
  WebKit = 'webkit',
}

export type Path = string
export type WSFrame = string | Buffer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LaunchArgs = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Serializable = any

export interface RunConfig {
  binary: Path
  browser: BrowserType
  logLevel: LoggingLevel
  profile?: string
  seconds: number
  timeout: number
  url: URL
  userDataDir: Path
  viewport: {
    height: number
    width: number
  }
}
