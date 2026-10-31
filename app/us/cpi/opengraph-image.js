import { createIndicatorOg } from '../../lib/indicator-og'

export const alt = 'Macro Data Monitor · US CPI and Inflation Dashboard'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return createIndicatorOg({
    eyebrow: 'UNITED STATES / CONSUMER PRICES',
    title: 'What is driving US inflation?',
    subtitle: 'Momentum, official CPI weights, category contributions, base effects and conditional paths.',
  })
}
