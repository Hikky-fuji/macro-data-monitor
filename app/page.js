import OverviewWorkspace from './components/OverviewWorkspace'

export const metadata = {
  title: {
    absolute: 'US & Japan Core Indicators | Macro Data Monitor',
  },
  description:
    'Core US and Japan macro indicators from official sources: US CPI, payrolls, PCE, manufacturing, Fed policy and rates; Japan prices, wages and BOJ policy.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'US & Japan Core Indicators | Macro Data Monitor',
    description: 'One overview of the core US and Japan releases, built from FRED, BLS, BEA, e-Stat and BOJ data.',
    url: '/',
  },
}

export default function HomePage() {
  return <OverviewWorkspace />
}
