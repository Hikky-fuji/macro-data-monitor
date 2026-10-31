export const metadata = {
  title: { absolute: 'Yen & External Cost Transmission | Macro Data Monitor' },
  description:
    'Japan yen and inflation transmission dashboard covering USD/JPY, effective exchange rates, import prices, CPI and the overnight call rate.',
  alternates: { canonical: '/yen-transmission' },
  openGraph: {
    title: 'Yen & External Cost Transmission | Macro Data Monitor',
    description: 'Track the yen, import-price impulse and pass-through into Japanese inflation.',
    url: '/yen-transmission',
  },
}

export default function YenTransmissionLayout({ children }) {
  return children
}
