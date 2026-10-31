import { Analytics } from "@vercel/analytics/next"
import ChartTheme from './components/ChartTheme'
import { SiteFooter, SiteHeader } from './components/SiteChrome'
import './globals.css'
import { SITE_URL } from './lib/site.mjs'

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Macro Data Monitor',
      url: `${SITE_URL}/`,
      description: 'Official-source Japan and US macroeconomic dashboards for fast cross-indicator analysis.',
      inLanguage: ['en', 'ja'],
    },
    {
      '@type': 'DataCatalog',
      '@id': `${SITE_URL}/#catalog`,
      name: 'Macro Data Monitor',
      url: `${SITE_URL}/`,
      description: 'A curated catalog of Japan and United States macroeconomic dashboards built from official APIs and published datasets.',
      dataset: [
        {
          '@type': 'Dataset',
          name: 'Japan macroeconomic indicators',
          url: `${SITE_URL}/`,
          temporalCoverage: '2021/..',
          spatialCoverage: 'Japan',
          creator: { '@type': 'Organization', name: 'Macro Data Monitor' },
        },
        {
          '@type': 'Dataset',
          name: 'United States macroeconomic indicators',
          url: `${SITE_URL}/us`,
          temporalCoverage: '2015/..',
          spatialCoverage: 'United States',
          creator: { '@type': 'Organization', name: 'Macro Data Monitor' },
        },
      ],
    },
  ],
}

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Macro Data Monitor',
    template: '%s | Macro Data Monitor',
  },
  description: 'Japan and US macroeconomic dashboards with official-source inflation, growth, labor, consumption, survey and policy data.',
  applicationName: 'Macro Data Monitor',
  keywords: [
    'Japan economy',
    'US economy',
    'macroeconomic dashboard',
    'CPI',
    'PPI',
    'employment',
    'GDP',
    'FRED',
    'e-Stat',
  ],
  authors: [{ name: 'Macro Data Monitor' }],
  creator: 'Macro Data Monitor',
  openGraph: {
    type: 'website',
    siteName: 'Macro Data Monitor',
    title: 'Macro Data Monitor',
    description: 'Track Japan and US macro conditions from official data sources.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Macro Data Monitor' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Macro Data Monitor',
    description: 'Track Japan and US macro conditions from official data sources.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-v2.svg',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
          id="japanpulse-structured-data"
          type="application/ld+json"
        />
        <ChartTheme />
        <SiteHeader />
        <div className="site-content">{children}</div>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  )
}
