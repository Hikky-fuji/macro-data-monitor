export const metadata = {
  title: { absolute: 'US Retail Sales & Consumer Demand | Macro Data Monitor' },
  description: 'US advance retail sales, real spending momentum and category breadth using Census data via FRED.',
  alternates: { canonical: '/us/retail-sales' },
  openGraph: {
    title: 'US Retail Sales & Consumer Demand | Macro Data Monitor',
    description: 'Advance retail momentum, real demand and category breadth from official US data.',
    url: '/us/retail-sales',
    images: [{ url: '/us/retail-sales/opengraph-image', width: 1200, height: 630 }],
  },
}

export default function UsRetailSalesLayout({ children }) { return children }
