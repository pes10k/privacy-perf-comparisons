import { access, constants, mkdtempDisposable } from 'node:fs/promises'
import { join } from 'node:path'

import { Namespace } from 'argparse'

import { Browsers, programName } from './consts.js'

type Path = string

interface Args {
  browser: Browsers
  url: URL
  seconds: number
  userDataDir: Path
  profile?: string
}

const validSchemes = [
  'http',
  'https',
]

const isDirReadable = async (...pathSegments: Path[]): Promise<boolean> => {
  try {
    await access(join(...pathSegments), constants.R_OK)
    return true
  }
  catch {
    return false
  }
}

export const validateArgs = async (args: Namespace): Promise<Args> => {
  if (validSchemes.includes(args.url.scheme) || !args.url.hostname) {
    throw new Error('Invalid URL. Must contain a http(s) scheme and hostname.')
  }

  if (args.seconds <= 0) {
    throw new Error('Invalid "seconds". Must be a positive integer.')
  }

  if (args.profile && args.browser !== Browsers.Chromium) {
    throw new Error('Invalid profile. Only Chromium browsers support '
      + 'multiple profiles in a single user data dir.')
  }

  // Here we check that one of the following conditions are true:
  // 1. the user didn't specify a user-data-dir (in which case we create
  //    a temporary one).
  // 2. the user specified a user-data-dir, and that path is empty (in which
  //    case we rely on the browser to create a new user data dir at the given
  //    path),
  // 3. the user specified
  //    i. NOT chromium AND
  //    ii. the user-data-dir exists
  //      (in which case we use the user-data-dir as the profile directory
  //      itself).
  // 4. the user specified
  //    i. chromium AND
  //    ii. the user-data-dir exists AND
  //    iii. the "profile" name exists as a subdirectory in the user-data-dir
  //      (in which case we have a clearly defined existing profile to use)
  // Any case other than one of the above cases is an error.

  // This is not the most concise way to check these cases, but meant
  // to be the easiest to follow, by matching the above exact criteria
  const isUserDataDirExisting = await isDirReadable(args.userDataDir)
  const isChromium = (args.browser === Browsers.Chromium)

  const isCaseOne = (!args.userDataDir)
  const isCaseTwo = (
    !isCaseOne
    && args.userDataDir
    && !isUserDataDirExisting
  )
  const isCaseThree = (
    !isCaseOne && !isCaseTwo
    && !isChromium
    && isUserDataDirExisting
  )
  const isCaseFour = (
    !isCaseOne && !isCaseTwo && !isCaseThree
    && isChromium
    && isUserDataDirExisting
    && await isDirReadable(args.userDataDir, args.profile)
  )

  let validatedUserDataDir, validatedProfile
  if (isCaseOne) {
    validatedUserDataDir = (await mkdtempDisposable(programName)).path
  }
  else if (isCaseTwo || isCaseThree) {
    validatedUserDataDir = args.userDataDir
  }
  else if (isCaseFour) {
    validatedUserDataDir = join(args.userDataDir, args.profile)
    validatedProfile = args.profile
  }
  else {
    throw new Error(
      'Invalid user-data-dir config.  Either must specify no '
      + 'user-data-dir, or a user-data-dir argument for a directory that '
      + 'does not currently exist, or specify a valid user-data-dir (with '
      + 'the specified profile as a subdirectory in the user-data-dir if '
      + 'chromium).',
    )
  }

  return {
    browser: args.browser,
    url: args.url,
    seconds: args.seconds,
    userDataDir: validatedUserDataDir,
    profile: validatedProfile,
  }
}
