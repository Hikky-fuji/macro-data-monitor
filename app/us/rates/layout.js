export const metadata = {
  title: { absolute: 'US Rates & Financial Conditions | Macro Data Monitor' },
  description: 'US policy rates, Treasury yield curve, real yields, breakeven inflation and Chicago Fed financial conditions from official sources via FRED.',
  alternates: { canonical: '/us/rates' },
  openGraph: {
    title: 'US Rates & Financial Conditions | Macro Data Monitor',
    description: 'Follow policy pricing, the Treasury curve, real yields, inflation compensation and broad financial conditions.',
    url: '/us/rates',
  },
}

export default function UsRatesLayout({ children }) {
  return children
}
