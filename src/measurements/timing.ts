import { Serializable } from '../types.js'

// Breaking the eslint rules to make it very-extra-explicit that this code
// is run in page scope, and not playwright / node scope.
//
// eslint-disable-next-line camelcase
export const injected_GetPageMeasurements = (): Serializable => {
  return new Promise((resolve) => {
    const navEntries = window.performance.getEntriesByType('navigation')[0]

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const lastLCPEntry = entries[entries.length - 1]
      resolve({
        navigation: navEntries.toJSON(),
        lcp: lastLCPEntry.toJSON(),
      })
    })

    observer.observe({
      type: 'largest-contentful-paint',
      buffered: true,
    })
  })
}
