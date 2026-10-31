import { createIndicatorOg } from '../lib/indicator-og'

export const alt = 'Macro Data Monitor · US Macro Dashboard'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return createIndicatorOg({
    eyebrow: 'UNITED STATES / MACRO WORKSPACE',
    title: 'US growth, inflation, labor and policy.',
    subtitle: 'Official-source indicators organized for fast cross-indicator analysis.',
    accent: '#42a9bc',
  })
}
